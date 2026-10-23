using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Products;

public sealed class DetailModel(CatalogService catalog, StoreCatalogService store, SeoService seo, ContentLocalizer localizer) : PageModel
{
    public Product Product { get; private set; } = null!;
    public SiteSettings Settings { get; private set; } = new();
    public StoreCatalogConfiguration Store { get; private set; } = new();
    public StoreCategory? Category { get; private set; }
    public List<Product> Related { get; private set; } = [];
    public List<Product> Alternatives { get; private set; } = [];
    public List<Product> Bundle { get; private set; } = [];
    public List<EquipmentModel> CompatibleModels { get; private set; } = [];
    public async Task<IActionResult> OnGetAsync(string slug, CancellationToken ct)
    {
        var product = await catalog.GetProductAsync(slug, ct);
        if (product is null) return NotFound();
        Product = product;
        Settings = await catalog.GetSettingsAsync(ct);
        Store = await store.GetAsync(ct);
        Category = Store.Categories.FirstOrDefault(x => x.Id == product.CatalogCategoryId);
        var products = await catalog.GetProductsAsync(ct);
        Related = Resolve(product.RelatedProductSlugs, products);
        Alternatives = Resolve(product.AlternativeProductSlugs, products);
        Bundle = Resolve(product.BundleProductSlugs, products);
        CompatibleModels = Store.EquipmentModels.Where(x => product.CompatibleModelIds.Contains(x.Id)).OrderBy(x => x.Brand).ThenBy(x => x.Series).ThenBy(x => x.Name).ToList();
        ViewData["Title"] = product.Title + localizer[" | TERMOMASTER"];
        ViewData["Description"] = product.Description;
        ViewData["Canonical"] = "/products/" + slug;
        ViewData["Image"] = product.Image;
        ViewData["NoIndex"] = product.Demo;
        if (!product.Demo) ViewData["StructuredData"] = seo.Product(product);
        ViewData["BreadcrumbData"] = seo.Breadcrumbs((localizer["Գլխավոր"], "/"),
            (Category?.Title ?? localizer["Կատալոգ"], Category is null ? "/catalog" : "/catalog?category=" + Uri.EscapeDataString(Category.Id)),
            (product.Title, "/products/" + slug));
        return Page();
    }
    private List<Product> Resolve(IEnumerable<string> slugs, List<Product> products) => slugs.Distinct().Where(x => x != Product.Slug).Select(x => products.FirstOrDefault(p => p.Slug == x)).OfType<Product>().ToList();
}
