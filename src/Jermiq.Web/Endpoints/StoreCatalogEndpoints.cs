using System.Text.Json;
using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Antiforgery;

namespace Jermiq.Web.Endpoints;

public static class StoreCatalogEndpoints
{
    public static void MapStoreCatalogApi(this WebApplication app)
    {
        app.MapGet("/api/store-catalog", async (StoreCatalogService store, CancellationToken ct) =>
            Results.Json(await store.GetAsync(ct)));
        app.MapGet("/api/admin/store-catalog", async (StoreCatalogService store, CancellationToken ct) =>
            Results.Json(await store.GetAsync(ct, false))).RequireAuthorization("Admin");
        app.MapPut("/api/admin/store-catalog", async (HttpContext ctx, IAntiforgery anti, StoreCatalogService store, CancellationToken ct) =>
        {
            await anti.ValidateRequestAsync(ctx);
            StoreCatalogConfiguration? body;
            try { body = await ctx.Request.ReadFromJsonAsync<StoreCatalogConfiguration>(ct); }
            catch (JsonException) { return Error("Հարցման ձևաչափը սխալ է։"); }
            if (body is null) return Error("Հարցումը դատարկ է։");
            try { return Results.Json(await store.SaveAsync(body, ct)); }
            catch (StoreCatalogConflictException e) { return Error(e.Message, 409); }
            catch (ArgumentException e) { return Error(e.Message); }
        }).RequireAuthorization("Admin");
    }
    private static IResult Error(string message, int status = 400) => new LocalizedError(message, status);
}
