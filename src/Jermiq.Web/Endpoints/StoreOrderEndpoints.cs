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

public static class StoreOrderEndpoints
{
    public static readonly string[] Statuses = ["new", "confirmed", "preparing", "shipped", "completed", "cancelled"];

    public static void MapStoreOrderApi(this WebApplication app)
    {
        app.MapPost("/api/orders", CreateAsync);
        app.MapGet("/api/admin/orders", async (HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            ctx.Response.Headers.CacheControl = "private, no-store";
            var rows = await db.Settings.AsNoTracking().Where(x => x.Key.StartsWith("order:")).ToListAsync(ct);
            IEnumerable<StoreOrder> orders = rows.Select(x => SiteJson.Deserialize<StoredOrder>(x.Value).Order);
            var status = ctx.Request.Query["status"].ToString();
            var query = ctx.Request.Query["q"].ToString().Trim();
            if (query.Length > 200) query = query[..200];
            if (status.Length > 0 && status != "all") orders = orders.Where(x => x.Status == status);
            if (query.Length > 0)
                orders = orders.Where(x => string.Join(' ', x.Id, x.Name, x.Phone, x.Email, x.Address,
                    string.Join(' ', x.Items.Select(i => i.Title + " " + i.Sku))).Contains(query, StringComparison.OrdinalIgnoreCase));
            var total = orders.Count();
            const int pageSize = 30;
            var page = int.TryParse(ctx.Request.Query["page"], out var n) ? Math.Max(1, n) : 1;
            page = Math.Min(page, Math.Max(1, (total + pageSize - 1) / pageSize));
            return Results.Json(new { orders = orders.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize), total, page, pageSize });
        }).RequireAuthorization("BackOffice");
        app.MapPatch("/api/admin/orders/{id}", UpdateStatusAsync).RequireAuthorization("BackOffice");
    }

    private static async Task<IResult> CreateAsync(HttpContext ctx, IAntiforgery anti, AppDbContext db, StoreCatalogService store, CancellationToken ct)
    {
        await anti.ValidateRequestAsync(ctx);
        if (!ctx.Request.HasJsonContentType()) return Error("Պատվերի ձևաչափը սխալ է։");
        StoreOrderRequest? request;
        try { request = await ctx.Request.ReadFromJsonAsync<StoreOrderRequest>(ct); }
        catch (JsonException) { return Error("Պատվերի ձևաչափը սխալ է։"); }
        if (request is null || !Guid.TryParseExact(request.RequestId, "D", out var guid) ||
            new[] { request.Name, request.Phone, request.Email, request.Address, request.DeliveryMethod, request.PaymentMethod, request.Message }.Any(x => x is null) ||
            request.Items is null || request.Items.Count is < 1 or > 100 || request.Items.Any(x => x is null || x.Slug is null || !Regex.IsMatch(x.Slug, "^[a-z0-9-]{2,80}$") || x.Quantity is < 1 or > 20) ||
            request.Items.Select(x => x.Slug).Distinct(StringComparer.Ordinal).Count() != request.Items.Count)
            return Error("Ստուգեք պատվերի ապրանքներն ու քանակները։");
        request.Name = request.Name.Trim(); request.Phone = request.Phone.Trim(); request.Email = request.Email.Trim();
        request.Address = request.Address.Trim(); request.Message = request.Message.Trim();
        if (request.Name.Length is < 2 or > 100 || request.Phone.Length > 30 || !Regex.IsMatch(request.Phone, "^[+0-9 ()-]{7,30}$") || request.Phone.Count(char.IsAsciiDigit) < 7 ||
            request.Email.Length > 200 || (request.Email.Length > 0 && !new EmailAddressAttribute().IsValid(request.Email)) || request.Address.Length > 500 || request.Message.Length > 3000 ||
            !request.Consent || request.DeliveryMethod is not ("pickup" or "delivery") || request.PaymentMethod is not ("manager" or "cash") || (request.DeliveryMethod == "delivery" && request.Address.Length < 5))
            return Error("Ստուգեք կոնտակտները, ստացման եղանակը և համաձայնությունը։");

        request.RequestId = guid.ToString();
        request.Items = request.Items.OrderBy(x => x.Slug, StringComparer.Ordinal).ToList();
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(SiteJson.Serialize(request))));
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var key = "order:" + request.RequestId;
        var existing = await db.Settings.AsNoTracking().SingleOrDefaultAsync(x => x.Key == key, ct);
        if (existing is not null)
        {
            var stored = SiteJson.Deserialize<StoredOrder>(existing.Value);
            return stored.PayloadHash == hash ? Results.Json(new { id = stored.Order.Id, order = stored.Order })
                : Error("Այս պատվերի համարն արդեն օգտագործվել է այլ տվյալներով։", 409);
        }
        if (await db.Leads.AnyAsync(x => x.Id == request.RequestId, ct)) return Error("Այս հայտի համարն արդեն օգտագործված է։", 409);

        var slugs = request.Items.Select(x => x.Slug).ToArray();
        var rows = await db.Products.AsNoTracking().Where(x => slugs.Contains(x.Slug)).ToListAsync(ct);
        var products = rows.Select(x => SiteJson.Deserialize<Product>(x.Data)).ToDictionary(x => x.Slug, StringComparer.Ordinal);
        var visibleCategories = (await store.GetAsync(ct)).Categories.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        var createdAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var order = new StoreOrder
        {
            Id = request.RequestId, CreatedAt = createdAt, Revision = createdAt, Name = request.Name, Phone = request.Phone,
            Email = request.Email, Address = request.Address, DeliveryMethod = request.DeliveryMethod,
            PaymentMethod = request.PaymentMethod, Message = request.Message
        };
        foreach (var item in request.Items)
        {
            if (!products.TryGetValue(item.Slug, out var p) || !p.Published || (p.CatalogCategoryId.Length > 0 && !visibleCategories.Contains(p.CatalogCategoryId)))
                return Error("Պատվերի ապրանքն այլևս հասանելի չէ։ Թարմացրեք զամբյուղը։", 409);
            if (p.StockQuantity is not null && p.StockQuantity < item.Quantity)
                return Error("Ընտրված քանակը գերազանցում է ապրանքի առկայությունը։ Թարմացրեք զամբյուղը։", 409);
            order.Items.Add(new StoreOrderItem
            {
                Slug = p.Slug, Title = p.Title, Sku = p.Sku, Quantity = item.Quantity,
                UnitPrice = p.Price, PriceIsEstimate = p.PriceIsEstimate, LineTotal = p.Price * item.Quantity
            });
        }
        order.KnownSubtotal = order.Items.Sum(x => x.LineTotal ?? 0);
        order.Subtotal = order.Items.Any(x => x.UnitPrice is null || x.PriceIsEstimate) ? null : order.KnownSubtotal;
        order.RequiresConfirmation = order.Subtotal is null || order.DeliveryMethod == "delivery";
        order.DeliveryPrice = order.DeliveryMethod == "pickup" ? 0 : null;
        var selection = string.Join('\n', order.Items.Select(x => $"{x.Title} ({x.Sku}) × {x.Quantity} · {(x.UnitPrice is null ? "գինը ճշտվում է" : x.UnitPrice.Value.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) + " AMD")}"));
        // The same durable arrival notification reaches the existing office desk.
        var lead = new Lead
        {
            Id = order.Id, Kind = "order", Name = order.Name, Phone = order.Phone, Email = order.Email,
            Message = order.Message, Status = "new", CreatedAt = order.CreatedAt, PayloadHash = hash,
            Details = SiteJson.Serialize(new { subject = "Պատվեր · " + order.Id, selection, orderId = order.Id })
        };
        db.Settings.Add(new SettingRecord { Key = key, Value = SiteJson.Serialize(new StoredOrder { PayloadHash = hash, Order = order }) });
        db.Leads.Add(lead);
        db.LeadArrivals.Add(new LeadArrival { LeadId = order.Id });
        var office = new OfficeLead { Source = "website", Address = order.Address, Subject = "Պատվեր · " + order.Id, Selection = selection };
        BackOfficeEndpoints.Record(office, ctx, "Ստեղծվել է պատվեր կայքից");
        BackOfficeEndpoints.StoreOffice(db, order.Id, null, office);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Json(new { id = order.Id, order }, statusCode: 201);
    }

    private static async Task<IResult> UpdateStatusAsync(string id, HttpContext ctx, IAntiforgery anti, AppDbContext db, CancellationToken ct)
    {
        await anti.ValidateRequestAsync(ctx);
        if (!ctx.Request.HasJsonContentType()) return Error("Հարցման ձևաչափը սխալ է։");
        if (!Guid.TryParseExact(id, "D", out var guid)) return Error("Պատվերը չի գտնվել։", 404);
        StoreOrderStatusEdit? edit;
        try { edit = await ctx.Request.ReadFromJsonAsync<StoreOrderStatusEdit>(ct); }
        catch (JsonException) { return Error("Հարցման ձևաչափը սխալ է։"); }
        if (edit is null || !Statuses.Contains(edit.Status)) return Error("Ընտրեք պատվերի ճիշտ կարգավիճակը։");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var row = await db.Settings.SingleOrDefaultAsync(x => x.Key == "order:" + guid.ToString(), ct);
        if (row is null) return Error("Պատվերը չի գտնվել։", 404);
        var stored = SiteJson.Deserialize<StoredOrder>(row.Value);
        if (stored.Order.Revision != edit.Revision) return Error("Պատվերը փոխվել է այլ աշխատակցի կողմից։ Թարմացրեք տվյալները։", 409);
        stored.Order.Status = edit.Status;
        stored.Order.Revision = Math.Max(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), stored.Order.Revision + 1);
        row.Value = SiteJson.Serialize(stored);
        var lead = await db.Leads.SingleOrDefaultAsync(x => x.Id == guid.ToString(), ct);
        if (lead is not null)
        {
            lead.Status = edit.Status switch { "new" => "new", "confirmed" => "contacted", "preparing" or "shipped" => "in_progress", "completed" => "completed", _ => "cancelled" };
            var officeRow = await db.Settings.SingleOrDefaultAsync(x => x.Key == "office:" + lead.Id, ct);
            var office = BackOfficeEndpoints.Office(lead, officeRow);
            BackOfficeEndpoints.Record(office, ctx, "Պատվերի կարգավիճակը · " + edit.Status);
            BackOfficeEndpoints.StoreOffice(db, lead.Id, officeRow, office);
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Json(new { order = stored.Order });
    }

    private static IResult Error(string message, int status = 400) => new LocalizedError(message, status);
}
