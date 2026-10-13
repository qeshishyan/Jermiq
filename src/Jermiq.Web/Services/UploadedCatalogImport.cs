using Jermiq.Web.Data;
using Jermiq.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Jermiq.Web.Services;

// A versioned, additive data import. The completion marker prevents deleted
// products from returning and preserves administrator edits on later startups.
public static class UploadedCatalogImport
{
    public const string ImportKey = "catalog-import:uploaded-spare-parts-35:v1";
    private const string Bundle = "Imports/uploaded-spare-parts-35";

    public static async Task ApplyAsync(AppDbContext db, IWebHostEnvironment environment, FileStorage storage)
    {
        var products = StaticContent.Read<List<Product>>(environment, Bundle + "/products");
        // Restore bundled image files when moving an existing database to a new
        // server. Existing images, including any administrator changes, survive.
        foreach (var product in products)
        {
            var id = Guid.ParseExact(product.Image.Replace("/api/product-image?id=", ""), "D").ToString();
            if (storage.FindProductImage(id) is not null) continue;
            var source = Path.Combine(environment.ContentRootPath, "SeedData", Bundle, "images", id + ".png");
            await using var stream = File.OpenRead(source);
            var file = new FormFile(stream, 0, stream.Length, "image", id + ".png") { Headers = new HeaderDictionary(), ContentType = "image/png" };
            var image = await FileStorage.ValidateImageAsync(file, CancellationToken.None);
            await storage.SaveAsync("products", id, image, CancellationToken.None);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        if (await db.Settings.AnyAsync(x => x.Key == ImportKey)) return;
        var existing = (await db.Products.AsNoTracking().ToListAsync())
            .Select(x => SiteJson.Deserialize<Product>(x.Data)).ToList();
        var imported = 0;
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var product in products)
        {
            var code = product.Specs.GetValueOrDefault("Պահեստամասի կոդ");
            var hasCode = !string.IsNullOrWhiteSpace(code) && code != "Չհաստատված";
            // Match a real source code even if an administrator chose a different slug.
            if (existing.Any(x => x.Slug == product.Slug || hasCode &&
                string.Equals(x.Brand, product.Brand, StringComparison.OrdinalIgnoreCase) &&
                x.Specs.GetValueOrDefault("Պահեստամասի կոդ")?.Replace(" ", "") == code!.Replace(" ", ""))) continue;
            db.Products.Add(new ProductRecord { Slug = product.Slug, Data = SiteJson.Serialize(product), UpdatedAt = timestamp + imported });
            existing.Add(product);
            imported++;
        }
        db.Settings.Add(new SettingRecord { Key = ImportKey, Value = SiteJson.Serialize(new
        {
            imported, skipped = products.Count - imported, completedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        }) });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
    }
}
