using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Jermiq.Web.Data;
using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace Jermiq.Web.Endpoints;

public static class ApiEndpoints
{
    private static readonly HashSet<string> Kinds = ["service", "question", "part", "order", "callback"];
    public static void MapJermiqApi(this WebApplication app)
    {
        app.MapGet("/api/catalog", async (CatalogService catalog, CancellationToken ct) =>
            Results.Json(new { products = await catalog.GetProductsAsync(ct) }));
        app.MapPost("/api/leads", CreateLeadAsync);
        app.MapGet("/api/admin", async (AppDbContext db, CatalogService catalog, HttpContext ctx, CancellationToken ct) =>
        {
            ctx.Response.Headers.CacheControl = "private, no-store";
            return Results.Json(new
            {
                leads = await db.Leads.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(ct),
                products = await catalog.GetProductsAsync(ct, false), settings = await catalog.GetSettingsAsync(ct, false), isAdmin = ctx.User.IsInRole("Admin")
            });
        }).RequireAuthorization("BackOffice");
        app.MapPost("/api/admin", MutateAdminAsync).RequireAuthorization("Admin");
        app.MapPost("/api/product-image", async (HttpContext ctx, IAntiforgery anti, FileStorage storage, CancellationToken ct) =>
        {
            await anti.ValidateRequestAsync(ctx);
            if (!ctx.Request.HasFormContentType) return Error("Սպասվում է լուսանկար։");
            var file = (await ctx.Request.ReadFormAsync(ct)).Files.GetFile("image");
            if (file is null) return Error("Ընտրեք լուսանկարը։");
            try
            {
                var image = await FileStorage.ValidateImageAsync(file, ct);
                var id = Guid.NewGuid().ToString();
                await storage.SaveAsync("products", id, image, ct);
                return Results.Json(new { image = $"/api/product-image?id={id}" });
            }
            catch (ArgumentException e) { return Error(e.Message); }
        }).RequireAuthorization("Admin");
        app.MapGet("/api/product-image", (string? id, FileStorage storage, HttpContext ctx) =>
        {
            if (!Guid.TryParseExact(id, "D", out var guid)) return Error("Պատկերը չի գտնվել։", 404);
            var path = storage.FindProductImage(guid.ToString());
            if (path is null) return Error("Պատկերը չի գտնվել։", 404);
            ctx.Response.Headers.CacheControl = "public, max-age=86400";
            return Results.File(path, FileStorage.ContentType(path));
        });
        app.MapGet("/api/attachments", async (string? id, AppDbContext db, FileStorage storage, HttpContext ctx, CancellationToken ct) =>
        {
            if (!Guid.TryParseExact(id, "D", out var guid)) return Error("Ֆայլը չի գտնվել։", 404);
            var lead = await db.Leads.AsNoTracking().SingleOrDefaultAsync(x => x.Id == guid.ToString(), ct);
            if (lead?.Attachment is null) return Error("Ֆայլը չի գտնվել։", 404);
            var path = storage.Resolve(lead.Attachment);
            if (!File.Exists(path)) return Error("Ֆայլը չի գտնվել։", 404);
            ctx.Response.Headers.CacheControl = "private, no-store";
            return Results.File(path, FileStorage.ContentType(path), $"attachment-{lead.Id}{Path.GetExtension(path)}");
        }).RequireAuthorization("BackOffice");
    }

    private static async Task<IResult> CreateLeadAsync(HttpContext ctx, IAntiforgery anti, AppDbContext db,
        FileStorage storage, CancellationToken ct)
    {
        await anti.ValidateRequestAsync(ctx);
        if (!ctx.Request.HasFormContentType) return Error("Ստուգեք հայտի ձևաչափը։");
        var form = await ctx.Request.ReadFormAsync(ct);
        string Text(string key, int max)
        {
            var value = form[key].ToString().Trim();
            if (value.Length > max) throw new ArgumentException("Լրացված դաշտը չափազանց երկար է։");
            return value;
        }
        string? savedFile = null;
        var committed = false;
        try
        {
            if (Text("website", 100).Length > 0) return Error("Չհաջողվեց ուղարկել հայտը։");
            var kind = Text("kind", 20);
            var name = Text("name", 100);
            var phone = Text("phone", 30);
            var email = Text("email", 200);
            if (!Kinds.Contains(kind) || name.Length < 2 || !Regex.IsMatch(phone, "^[+0-9 ()-]{7,30}$") ||
                phone.Count(char.IsAsciiDigit) < 7 || Text("consent", 10) != "true" ||
                (email.Length > 0 && !new EmailAddressAttribute().IsValid(email)))
                return Error("Ստուգեք անունը, հեռախոսը, էլ․ փոստը և համաձայնությունը։");
            var message = Text("message", 3000);
            var details = SiteJson.Serialize(new
            {
                subject = Text("subject", 200), brand = Text("brand", 100), model = Text("model", 100),
                selection = Text("details", 6000)
            });
            var submittedId = Text("requestId", 50);
            var id = Guid.TryParseExact(submittedId, "D", out var guid) ? guid.ToString() : Guid.NewGuid().ToString();
            var file = form.Files.GetFile("attachment");
            CheckedImage? image = file is { Length: > 0 } ? await FileStorage.ValidateImageAsync(file, ct) : null;
            // Idempotency compares the actual payload, including attachment bytes.
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(SiteJson.Serialize(new
            { kind, name, phone, email, message, details, attachmentHash = image?.Hash }))));
            var existing = await db.Leads.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (existing is not null) return existing.PayloadHash == hash
                ? Results.Json(new { id }) : Error("Այս հայտի համարը կիրառվել է այլ տվյալներով։ Թարմացրեք ձևը։", 409);
            if (image is not null) savedFile = await storage.SaveAsync("leads", Guid.NewGuid().ToString(), image, ct);
            var lead = new Lead
            {
                Id = id, Kind = kind, Name = name, Phone = phone, Email = email, Message = message,
                Details = details, Attachment = savedFile, Status = "new",
                CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), PayloadHash = hash
            };
            db.Leads.Add(lead);
            db.LeadArrivals.Add(new LeadArrival { LeadId = id });
            try { await db.SaveChangesAsync(ct); committed = true; }
            catch (DbUpdateException)
            {
                db.Entry(lead).State = EntityState.Detached;
                existing = await db.Leads.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
                if (existing is null) throw;
                return existing.PayloadHash == hash ? Results.Json(new { id }) : Error("Հայտի տվյալները փոխվել են։", 409);
            }
            return Results.Json(new { id }, statusCode: 201);
        }
        catch (ArgumentException e) { return Error(e.Message); }
        finally { if (!committed && savedFile is not null) storage.Delete(savedFile); }
    }

    private static async Task<IResult> MutateAdminAsync(HttpContext ctx, IAntiforgery anti, AppDbContext db,
        FileStorage storage, CancellationToken ct)
    {
        await anti.ValidateRequestAsync(ctx);
        AdminMutation? body;
        try { body = await ctx.Request.ReadFromJsonAsync<AdminMutation>(ct); }
        catch (JsonException) { return Error("Հարցման ձևաչափը սխալ է։"); }
        if (body is null) return Error("Հարցումը դատարկ է։");
        switch (body.Action)
        {
            case "product":
                var p = body.Product;
                if (p is null || new[] { p.Title, p.Brand, p.Model, p.Description, p.Availability }.Any(x => x is null) || !Valid(p) || p.Specs is null || p.Specs.Count > 50 ||
                    p.Specs.Any(x => string.IsNullOrWhiteSpace(x.Key) || x.Key.Length > 100 || x.Value is null || x.Value.Length > 500) ||
                    !Regex.IsMatch(p.Image ?? "", "^/(images/(hero|parts)\\.webp|api/product-image\\?id=[a-f0-9-]{36})$"))
                    return Error("Ստուգեք ապրանքի լրացված տվյալները։");
                var row = await db.Products.SingleOrDefaultAsync(x => x.Slug == p.Slug, ct);
                if (row is null) db.Products.Add(row = new ProductRecord { Slug = p.Slug });
                row.Data = SiteJson.Serialize(p);
                row.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                break;
            case "settings":
                var settings = body.Settings;
                if (settings is null || new[] { settings.Phone, settings.Email, settings.Address, settings.Hours, settings.Warranty, settings.Delivery }.Any(x => x is null) || !Valid(settings) || settings.ServicePrices is null || settings.ServicePrices.Count > 20 ||
                    settings.ServicePrices.Any(x => x.Key.Length > 50 || x.Value is null || x.Value.Length > 200) ||
                    (!string.IsNullOrEmpty(settings.Email) && !new EmailAddressAttribute().IsValid(settings.Email)))
                    return Error("Ստուգեք կոնտակտներն ու պայմանները։");
                var settingRow = await db.Settings.SingleAsync(x => x.Key == "site", ct);
                settingRow.Value = SiteJson.Serialize(settings);
                break;
            case "status":
            case "delete":
                if (!Guid.TryParseExact(body.Id, "D", out var id)) return Error("Հայտը չի գտնվել։", 404);
                var lead = await db.Leads.SingleOrDefaultAsync(x => x.Id == id.ToString(), ct);
                if (lead is null) return Error("Հայտը չի գտնվել։", 404);
                if (body.Action == "status")
                {
                    if (!BackOfficeEndpoints.Statuses.Contains(body.Status ?? "")) return Error("Հայտի կարգավիճակը սխալ է։");
                    lead.Status = body.Status!;
                    var officeRow = await db.Settings.SingleOrDefaultAsync(x => x.Key == "office:" + lead.Id, ct);
                    var office = BackOfficeEndpoints.Office(lead, officeRow);
                    BackOfficeEndpoints.Record(office, ctx, "Փոխվել է կարգավիճակը · " + body.Status);
                    BackOfficeEndpoints.StoreOffice(db, lead.Id, officeRow, office);
                }
                else
                {
                    var metadata = await db.Settings.SingleOrDefaultAsync(x => x.Key == "office:" + lead.Id, ct);
                    if (metadata is not null) db.Settings.Remove(metadata);
                    db.Leads.Remove(lead);
                    await db.SaveChangesAsync(ct);
                    storage.Delete(lead.Attachment);
                    return Results.Json(new { ok = true });
                }
                break;
            default: return Error("Անհայտ գործողություն։");
        }
        await db.SaveChangesAsync(ct);
        return Results.Json(new { ok = true });
    }
    private static bool Valid(object model) => Validator.TryValidateObject(model, new ValidationContext(model), [], true);
    private static IResult Error(string error, int status = 400) => Results.Json(new { error }, statusCode: status);
    private sealed class AdminMutation
    {
        public string Action { get; set; } = "";
        public Product? Product { get; set; }
        public SiteSettings? Settings { get; set; }
        public string? Id { get; set; }
        public string? Status { get; set; }
    }
}
