using System.Text.Json;
using Jermiq.Web.Data;
using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.EntityFrameworkCore;

namespace Jermiq.Web.Endpoints;

public static class ManagementEndpoints
{
    public static void MapManagementApi(this WebApplication app)
    {
        app.MapGet("/api/admin/dashboard", async (HttpContext ctx, AppDbContext db, CatalogService catalog, CancellationToken ct) =>
        {
            var now = DateTimeOffset.UtcNow;
            var local = now.ToOffset(TimeSpan.FromHours(4));
            var start = new DateTimeOffset(local.Date, TimeSpan.FromHours(4)).ToUnixTimeMilliseconds();
            var leads = await db.Leads.AsNoTracking().Select(x => new { x.Id, x.Status, x.CreatedAt }).ToListAsync(ct);
            var rows = await db.Settings.AsNoTracking().Where(x => x.Key.StartsWith("office:")).ToListAsync(ct);
            var offices = rows.ToDictionary(x => x.Key[7..], x => SiteJson.Deserialize<OfficeLead>(x.Value));
            var active = leads.Where(x => x.Status is not ("completed" or "cancelled")).ToList();
            var latest = await db.Leads.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(6)
                .Select(x => new { x.Id, x.Name, x.Kind, x.Status, x.CreatedAt }).ToListAsync(ct);
            object? catalogSummary = null;
            if (ctx.User.IsInRole("Admin"))
            {
                var products = await catalog.GetProductsAsync(ct, false);
                catalogSummary = new { total = products.Count, demo = products.Count(p => p.Demo), withoutPrice = products.Count(p => p.Price is null), withoutDescription = products.Count(p => string.IsNullOrWhiteSpace(p.Description)) };
            }
            return Results.Json(new { total = leads.Count, today = leads.Count(x => x.CreatedAt >= start), active = active.Count,
                urgent = active.Count(x => offices.GetValueOrDefault(x.Id)?.Priority == "urgent"),
                overdue = active.Count(x => offices.GetValueOrDefault(x.Id)?.DueAt < now),
                unassigned = active.Count(x => string.IsNullOrEmpty(offices.GetValueOrDefault(x.Id)?.Assignee)),
                statuses = leads.GroupBy(x => x.Status).Select(x => new { status = x.Key, count = x.Count() }), latest, catalog = catalogSummary });
        }).RequireAuthorization("BackOffice");
        app.MapPost("/api/admin/leads/bulk-status", async (HttpContext ctx, AppDbContext db, IAntiforgery anti, CancellationToken ct) =>
        {
            await anti.ValidateRequestAsync(ctx);
            BulkEdit? edit;
            try { edit = await ctx.Request.ReadFromJsonAsync<BulkEdit>(ct); }
            catch (JsonException) { return Error("Invalid bulk selection."); }
            if (edit?.Revisions is null || edit.Revisions.Count is < 1 or > 100 || !BackOfficeEndpoints.Statuses.Contains(edit.Status) || edit.Revisions.Any(x => !Guid.TryParseExact(x.Key, "D", out _) || x.Value < 0)) return Error("Invalid bulk selection.");
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var ids = edit.Revisions.Keys.ToArray();
            var leads = await db.Leads.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
            if (leads.Count != ids.Length) return Error("Some selected requests no longer exist. Refresh the list.", 409);
            var keys = ids.Select(id => "office:" + id).ToArray();
            var rows = await db.Settings.Where(x => keys.Contains(x.Key)).ToDictionaryAsync(x => x.Key, ct);
            foreach (var lead in leads)
            {
                var row = rows.GetValueOrDefault("office:" + lead.Id);
                var office = BackOfficeEndpoints.Office(lead, row);
                if (office.Revision != edit.Revisions[lead.Id]) return Error("Some selected requests have changed. Select them again.", 409);
                if (lead.Status == edit.Status) continue;
                var oldStatus = lead.Status; lead.Status = edit.Status;
                BackOfficeEndpoints.Record(office, ctx, "Bulk status update", new Dictionary<string, string> { ["Status"] = oldStatus + " → " + edit.Status });
                BackOfficeEndpoints.StoreOffice(db, lead.Id, row, office);
            }
            await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
            return Results.Json(new { ok = true, count = leads.Count });
        }).RequireAuthorization("BackOffice");
    }
    private sealed class BulkEdit
    {
        public Dictionary<string, long>? Revisions { get; set; }
        public string Status { get; set; } = "";
    }
    private static IResult Error(string message, int status = 400) => new LocalizedError(message, status);
}
