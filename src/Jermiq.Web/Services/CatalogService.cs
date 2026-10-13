using System.Text.Json;
using Jermiq.Web.Data;
using Jermiq.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Jermiq.Web.Services;

public static class SiteJson
{
    // Default escaping also prevents closing an inline JSON script with </script>.
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);
    public static T Deserialize<T>(string value) => JsonSerializer.Deserialize<T>(value, Options)
        ?? throw new InvalidDataException("Invalid stored JSON.");
}

public sealed class StaticContent(IWebHostEnvironment environment)
{
    public List<ServiceInfo> Services { get; } = Read<List<ServiceInfo>>(environment, "services");
    public List<ArticleInfo> Articles { get; } = Read<List<ArticleInfo>>(environment, "articles");
    public static T Read<T>(IWebHostEnvironment environment, string name) =>
        SiteJson.Deserialize<T>(File.ReadAllText(Path.Combine(environment.ContentRootPath, "SeedData", name + ".json")));
}

public sealed class CatalogService(AppDbContext db)
{
    public async Task<List<Product>> GetProductsAsync(CancellationToken ct = default) =>
        (await db.Products.AsNoTracking().OrderBy(x => x.UpdatedAt).ThenBy(x => x.Slug).ToListAsync(ct))
        .Select(x => SiteJson.Deserialize<Product>(x.Data)).ToList();

    public async Task<Product?> GetProductAsync(string slug, CancellationToken ct = default)
    {
        var row = await db.Products.AsNoTracking().SingleOrDefaultAsync(x => x.Slug == slug, ct);
        return row is null ? null : SiteJson.Deserialize<Product>(row.Data);
    }

    public async Task<SiteSettings> GetSettingsAsync(CancellationToken ct = default) =>
        SiteJson.Deserialize<SiteSettings>((await db.Settings.AsNoTracking().SingleAsync(x => x.Key == "site", ct)).Value);
}

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, IWebHostEnvironment environment, bool migrate)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (migrate) await db.Database.MigrateAsync();
        // SQLite WAL allows reads while another request commits a lead.
        await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
        if (!await db.Settings.AnyAsync())
            db.Settings.Add(new SettingRecord { Value = SiteJson.Serialize(StaticContent.Read<SiteSettings>(environment, "settings")) });
        if (!await db.Products.AnyAsync())
        {
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            db.Products.AddRange(StaticContent.Read<List<Product>>(environment, "products")
                .Select((p, index) => new ProductRecord { Slug = p.Slug, Data = SiteJson.Serialize(p), UpdatedAt = timestamp + index }));
        }
        await db.SaveChangesAsync();
    }
}
