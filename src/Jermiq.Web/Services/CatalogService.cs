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

public sealed class StaticContent(ContentLocalizer localizer)
{
    public List<ServiceInfo> Services => localizer.Content.Services.Select(x => new ServiceInfo(x.Id, localizer[x.Title], localizer[x.Desc])).ToList();
    public List<ArticleInfo> Articles => localizer.Content.Articles.Select(x => new ArticleInfo(x.Slug, localizer[x.Title], localizer[x.Intro], x.Sections.Select(s => s.Select(v => localizer[v]).ToArray()).ToList())).ToList();
    public static T Read<T>(IWebHostEnvironment environment, string name) =>
        SiteJson.Deserialize<T>(File.ReadAllText(Path.Combine(environment.ContentRootPath, "SeedData", name + ".json")));
}

public sealed class CatalogService(AppDbContext db, ContentLocalizer localizer, StoreCatalogService store)
{
    public async Task<List<Product>> GetProductsAsync(CancellationToken ct = default, bool localized = true)
    {
        var products = (await db.Products.AsNoTracking().OrderBy(x => x.UpdatedAt).ThenBy(x => x.Slug).ToListAsync(ct))
            .Select(ReadProduct).ToList();
        if (!localized) return products;
        var config = await store.GetAsync(ct);
        var categoryIds = config.Categories.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        var modelIds = config.EquipmentModels.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        products = products.Where(x => x.Published && (x.CatalogCategoryId.Length == 0 || categoryIds.Contains(x.CatalogCategoryId))).ToList();
        var slugs = products.Select(x => x.Slug).ToHashSet(StringComparer.Ordinal);
        foreach (var product in products)
        {
            product.CompatibleModelIds = product.CompatibleModelIds.Where(modelIds.Contains).ToList();
            product.RelatedProductSlugs = product.RelatedProductSlugs.Where(slugs.Contains).ToList();
            product.AlternativeProductSlugs = product.AlternativeProductSlugs.Where(slugs.Contains).ToList();
            product.BundleProductSlugs = product.BundleProductSlugs.Where(slugs.Contains).ToList();
        }
        return products.Select(x => Localize(x, true)).ToList();
    }
    public async Task<Product?> GetProductAsync(string slug, CancellationToken ct = default)
    {
        return (await GetProductsAsync(ct)).SingleOrDefault(x => x.Slug == slug);
    }
    private static Product ReadProduct(ProductRecord row)
    {
        var product = SiteJson.Deserialize<Product>(row.Data); product.Revision = row.UpdatedAt; return product;
    }
    private Product Localize(Product p, bool localized)
    {
        if (!localized) return p;
        // Hide retired setup copy from existing catalogs without changing stored product data.
        if (p.Brand == "Արտադրողը՝ լրացման փուլում") p.Brand = "";
        if (p.Model == "Մոդելը՝ լրացման փուլում") p.Model = "";
        p.Description = p.Description.Replace(" Իրական արտադրողը, մոդելը, չափերը և տեխնիկական տվյալները կլրացվեն հաստատված տեսականու հիման վրա։", "");
        p.Specs = p.Specs.Where(x => x.Value != "Կլրացվի").ToDictionary(x => x.Key, x => x.Value);
        p.Title = localizer[p.Title]; p.Description = localizer[p.Description]; p.Availability = localizer[p.Availability];
        if (p.Brand == "Արտադրողը՝ լրացման փուլում") p.Brand = localizer[p.Brand];
        if (p.Model is "Մոդելը՝ լրացման փուլում" or "Համատեղելիությունը ճշտվում է") p.Model = localizer[p.Model];
        // Manufacturer identities, model codes and technical specifications stay verbatim.
        return p;
    }
    public async Task<SiteSettings> GetSettingsAsync(CancellationToken ct = default, bool localized = true)
    {
        var s = SiteJson.Deserialize<SiteSettings>((await db.Settings.AsNoTracking().SingleAsync(x => x.Key == "site", ct)).Value);
        s.Address = BrandIdentity.Text(s.Address); s.Hours = BrandIdentity.Text(s.Hours);
        s.Warranty = BrandIdentity.Text(s.Warranty); s.Delivery = BrandIdentity.Text(s.Delivery);
        s.ServicePrices = s.ServicePrices.ToDictionary(x => x.Key, x => BrandIdentity.Text(x.Value));
        if (localized)
        {
            s.Address = localizer[s.Address]; s.Hours = localizer[s.Hours]; s.Warranty = localizer[s.Warranty]; s.Delivery = localizer[s.Delivery];
            s.ServicePrices = s.ServicePrices.ToDictionary(x => x.Key, x => localizer[x.Value]);
        }
        return s;
    }
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
        await UploadedCatalogImport.ApplyAsync(db, environment, scope.ServiceProvider.GetRequiredService<FileStorage>());
        await RealCatalogImport.ApplyAsync(db, environment);
        await StoreCatalogService.InitializeAsync(db, environment);
    }
}
