using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Products;

public sealed class DetailModel(CatalogService catalog, SeoService seo) : PageModel
{
    public Product Product { get; private set; } = null!;
    public SiteSettings Settings { get; private set; } = new();
    public List<Product> Related { get; private set; } = [];
    public async Task<IActionResult> OnGetAsync(string slug, CancellationToken ct)
    {
        var product = await catalog.GetProductAsync(slug, ct);
        if (product is null) return NotFound();
        Product = product;
        Settings = await catalog.GetSettingsAsync(ct);
        Related = (await catalog.GetProductsAsync(ct)).Where(x => x.Category == product.Category && x.Slug != slug).Take(4).ToList();
        ViewData["Title"] = product.Title + " | Ջերմիք";
        ViewData["Description"] = product.Description;
        ViewData["Canonical"] = "/products/" + slug;
        ViewData["Image"] = product.Image;
        ViewData["NoIndex"] = product.Demo;
        if (!product.Demo) ViewData["StructuredData"] = seo.Product(product);
        ViewData["BreadcrumbData"] = seo.Breadcrumbs(("Գլխավոր", "/"),
            (product.Category == "heater" ? "Ջրատաքացուցիչներ" : "Պահեստամասեր", product.Category == "heater" ? "/catalog" : "/parts"),
            (product.Title, "/products/" + slug));
        return Page();
    }
}
