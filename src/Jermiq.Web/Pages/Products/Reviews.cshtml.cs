using Jermiq.Web.Data;
using Jermiq.Web.Endpoints;
using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Products;

public sealed class ReviewsModel(CatalogService catalog, AppDbContext db, ContentLocalizer localizer) : PageModel
{
    public Product Product { get; private set; } = null!;
    public ProductReviewPage Reviews { get; private set; } = new([], null, 0, 1, 20);
    public async Task<IActionResult> OnGetAsync(string slug, int? p, CancellationToken ct)
    {
        var product = await catalog.GetProductAsync(slug, ct);
        if (product is null) return NotFound();
        Product = product;
        Reviews = await ProductReviewEndpoints.GetApprovedAsync(db, slug, p ?? 1, ct);
        ViewData["Title"] = localizer["Կարծիքներ"] + " · " + product.Title + " | TERMOMASTER";
        ViewData["Description"] = localizer["Ապրանքի մասին գնորդների կարծիքներ և գնահատականներ։"];
        ViewData["Canonical"] = "/products/" + slug + "/reviews";
        ViewData["NoIndex"] = true;
        return Page();
    }
}
