using Jermiq.Web.Data;
using Jermiq.Web.Models;
using Microsoft.EntityFrameworkCore;
namespace Jermiq.Web.Services;

// Applied once; later price edits and deletions belong to the administrator.
public static class RealCatalogImport
{
    public const string ImportKey = "catalog-import:real-products-10:v1";
    public static async Task ApplyAsync(AppDbContext db, IWebHostEnvironment environment)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (await db.Settings.AnyAsync(x => x.Key == ImportKey)) return;
        var products = StaticContent.Read<List<Product>>(environment, "Imports/real-products-10/products");
        var existing = (await db.Products.AsNoTracking().ToListAsync()).Select(x => SiteJson.Deserialize<Product>(x.Data)).ToList();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var imported = 0;
        foreach (var product in products)
        {
            if (existing.Any(x => x.Slug == product.Slug ||
                string.Equals(x.Brand, product.Brand, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(x.Model, product.Model, StringComparison.OrdinalIgnoreCase) &&
                x.Specs.GetValueOrDefault("Պահեստամասի կոդ") == product.Specs.GetValueOrDefault("Պահեստամասի կոդ"))) continue;
            db.Products.Add(new ProductRecord { Slug = product.Slug, Data = SiteJson.Serialize(product), UpdatedAt = now + imported++ });
        }
        db.Settings.Add(new SettingRecord { Key = ImportKey, Value = SiteJson.Serialize(new { imported, completedAt = now }) });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
    }
}
