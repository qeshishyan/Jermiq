using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Jermiq.Web.Data;
using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace Jermiq.Web.Endpoints;

public static class ProductReviewEndpoints
{
    public static readonly string[] Statuses = ["pending", "approved", "rejected"];

    public static void MapProductReviewApi(this WebApplication app)
    {
        app.MapPost("/api/products/{slug}/reviews", CreateAsync);
        app.MapGet("/api/products/{slug}/reviews", async (string slug, HttpContext ctx, AppDbContext db, CatalogService catalog, CancellationToken ct) =>
        {
            if (await catalog.GetProductAsync(slug, ct) is null) return Error("Ապրանքը չի գտնվել։", 404);
            ctx.Response.Headers.CacheControl = "no-store";
            var page = int.TryParse(ctx.Request.Query["page"], out var number) ? number : 1;
            return Results.Json(await GetApprovedAsync(db, slug, page, ct));
        });
        app.MapGet("/api/admin/reviews", async (HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            ctx.Response.Headers.CacheControl = "private, no-store";
            var status = ctx.Request.Query["status"].ToString();
            if (status.Length == 0) status = "pending";
            if (status != "all" && !Statuses.Contains(status)) return Error("Կարծիքի կարգավիճակը սխալ է։");
            var rows = await db.Settings.AsNoTracking().Where(x => x.Key.StartsWith("review:")).ToListAsync(ct);
            var reviews = rows.Select(x => SiteJson.Deserialize<ProductReview>(x.Value)).ToList();
            var filtered = status == "all" ? reviews : reviews.Where(x => x.Status == status).ToList();
            const int pageSize = 30;
            var page = int.TryParse(ctx.Request.Query["page"], out var number) ? number : 1;
            page = Math.Clamp(page, 1, Math.Max(1, (filtered.Count + pageSize - 1) / pageSize));
            return Results.Json(new
            {
                reviews = filtered.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).Select(AsAdmin),
                total = filtered.Count, page, pageSize,
                counts = Statuses.ToDictionary(s => s, s => reviews.Count(x => x.Status == s))
            });
        }).RequireAuthorization("Admin");
        app.MapPatch("/api/admin/reviews/{id}", ModerateAsync).RequireAuthorization("Admin");
    }

    public static async Task<ProductReviewPage> GetApprovedAsync(AppDbContext db, string slug, int page = 1, CancellationToken ct = default)
    {
        // Filter by product in SQLite before deserializing so one product does not load every review.
        var rows = await db.Settings.FromSqlInterpolated($"SELECT * FROM Settings WHERE Key LIKE 'review:%' AND json_extract(Value, '$.productSlug') = {slug}")
            .AsNoTracking().ToListAsync(ct);
        var approved = rows.Select(x => SiteJson.Deserialize<ProductReview>(x.Value)).Where(x => x.Status == "approved")
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).ToList();
        const int pageSize = 20;
        page = Math.Clamp(page, 1, Math.Max(1, (approved.Count + pageSize - 1) / pageSize));
        return new ProductReviewPage(approved.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new PublicProductReview(x.Id, x.Name, x.Rating, x.Message, x.CreatedAt)).ToList(),
            approved.Count == 0 ? null : Math.Round(approved.Average(x => x.Rating), 1), approved.Count, page, pageSize);
    }

    private static async Task<IResult> CreateAsync(string slug, HttpContext ctx, IAntiforgery anti, AppDbContext db,
        CatalogService catalog, CancellationToken ct)
    {
        await anti.ValidateRequestAsync(ctx);
        ReviewRequest? request;
        try { request = await ctx.Request.ReadFromJsonAsync<ReviewRequest>(ct); }
        catch (JsonException) { return Error("Կարծիքի ձևաչափը սխալ է։"); }
        if (request is null || !Guid.TryParseExact(request.RequestId, "D", out var id) ||
            request.Name is null || request.Email is null || request.Message is null) return Error("Ստուգեք կարծիքի լրացված տվյալները։");
        request.Name = request.Name.Trim(); request.Email = request.Email.Trim(); request.Message = request.Message.Trim();
        if (request.Name.Length is < 2 or > 100 || request.Message.Length is < 10 or > 3000 || request.Email.Length > 200 ||
            (request.Email.Length > 0 && !new EmailAddressAttribute().IsValid(request.Email)) || request.Rating is < 1 or > 5 || !request.Consent)
            return Error("Լրացրեք անունը, 1–5 գնահատականը, առնվազն 10 նիշով կարծիքը և համաձայնությունը։");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(SiteJson.Serialize(new
        { slug, request.Name, request.Email, request.Rating, request.Message, request.Consent }))));
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var key = "review:" + id.ToString();
        var existing = await db.Settings.AsNoTracking().SingleOrDefaultAsync(x => x.Key == key, ct);
        if (existing is not null)
        {
            var review = SiteJson.Deserialize<ProductReview>(existing.Value);
            return review.PayloadHash == hash ? Results.Json(new { id = review.Id, status = review.Status })
                : Error("Այս կարծիքի համարն արդեն օգտագործվել է այլ տվյալներով։", 409);
        }
        var product = await catalog.GetProductAsync(slug, ct);
        if (product is null) return Error("Ապրանքը չի գտնվել։", 404);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var created = new ProductReview
        {
            Id = id.ToString(), ProductSlug = product.Slug, ProductTitle = product.Title, Name = request.Name,
            Email = request.Email, Rating = request.Rating, Message = request.Message, Status = "pending",
            CreatedAt = timestamp, Revision = timestamp, PayloadHash = hash
        };
        db.Settings.Add(new SettingRecord { Key = key, Value = SiteJson.Serialize(created) });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Json(new { id = created.Id, status = created.Status }, statusCode: 201);
    }

    private static async Task<IResult> ModerateAsync(string id, HttpContext ctx, IAntiforgery anti, AppDbContext db, CancellationToken ct)
    {
        await anti.ValidateRequestAsync(ctx);
        ReviewModeration? request;
        try { request = await ctx.Request.ReadFromJsonAsync<ReviewModeration>(ct); }
        catch (JsonException) { return Error("Կարծիքի ձևաչափը սխալ է։"); }
        if (!Guid.TryParseExact(id, "D", out var guid) || request is null || !Statuses.Contains(request.Status) || request.Revision <= 0)
            return Error("Ստուգեք կարծիքի կարգավիճակն ու տարբերակը։");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var key = "review:" + guid.ToString();
        var row = await db.Settings.SingleOrDefaultAsync(x => x.Key == key, ct);
        if (row is null) return Error("Կարծիքը չի գտնվել։", 404);
        var review = SiteJson.Deserialize<ProductReview>(row.Value);
        if (request.Revision != review.Revision) return Error("Կարծիքը փոխվել է այլ աշխատակցի կողմից։ Թարմացրեք ցանկը։", 409);
        review.Status = request.Status;
        review.Revision = Math.Max(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), review.Revision + 1);
        row.Value = SiteJson.Serialize(review);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Json(new { review = AsAdmin(review) });
    }

    private static AdminProductReview AsAdmin(ProductReview x) => new(x.Id, x.ProductSlug, x.ProductTitle,
        x.Name, x.Email, x.Rating, x.Message, x.Status, x.CreatedAt, x.Revision);
    private static IResult Error(string message, int status = 400) => new LocalizedError(message, status);
    private sealed class ReviewRequest
    {
        public string RequestId { get; set; } = "";
        public string Name { get; set; } = "";
        public string Email { get; set; } = "";
        public int Rating { get; set; }
        public string Message { get; set; } = "";
        public bool Consent { get; set; }
    }
    private sealed class ReviewModeration
    {
        public long Revision { get; set; }
        public string Status { get; set; } = "";
    }
}
