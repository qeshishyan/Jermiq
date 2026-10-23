using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages;

public sealed class FindPartModel(CatalogService catalog, StoreCatalogService store, SeoService seo, ContentLocalizer localizer) : PageModel
{
    public string Mode { get; private set; } = "";
    public string Query { get; private set; } = "";
    public string CategoryId { get; private set; } = "";
    public string Brand { get; private set; } = "";
    public string ModelId { get; private set; } = "";
    public StoreCatalogConfiguration Store { get; private set; } = new();
    public List<Product> Products { get; private set; } = [];
    public List<Product> Results { get; private set; } = [];
    public int ResultCount { get; private set; }
    public bool HasSelection => Mode == "code" ? ProductSearch.Normalize(Query).Length >= 2 : Mode == "model" && Store.EquipmentModels.Any(x => x.Id == ModelId);
    public IEnumerable<StoreCategory> DeviceCategories => Store.Categories.Where(x => x.ParentId.Length == 0 && x.Id != "water-heaters").OrderBy(x => x.SortOrder).ThenBy(x => x.Title);
    public IEnumerable<EquipmentModel> AvailableModels => Store.EquipmentModels.Where(x => CategoryId.Length == 0 || StoreCatalogService.DescendantIds(Store.Categories, CategoryId).Contains(x.CategoryId));
    public IEnumerable<EquipmentModel> BrandModels => AvailableModels.Where(x => Brand.Length == 0 || x.Brand.Equals(Brand, StringComparison.OrdinalIgnoreCase));
    public async Task<IActionResult> OnGetAsync(string? mode, string? q, string? category, string? brand, string? model, CancellationToken ct)
    {
        Mode = mode is "code" or "model" or "photo" ? mode : "";
        Query = Limit(q, 200); CategoryId = Limit(category, 80); Brand = Limit(brand, 160); ModelId = Limit(model, 80);
        Store = await store.GetAsync(ct);
        if (CategoryId.Length > 0 && !Store.Categories.Any(x => x.Id == CategoryId)) CategoryId = "";
        Products = (await catalog.GetProductsAsync(ct)).Where(x => x.Category == "part").ToList();
        if (Mode == "model" && !BrandModels.Any(x => x.Id == ModelId)) ModelId = "";
        if (HasSelection)
        {
            IEnumerable<Product> matches = Mode == "model"
                ? Products.Where(x => x.CompatibleModelIds.Contains(ModelId))
                : Products.Where(x => MatchesCode(x, Query)).OrderByDescending(x => ExactCode(x, Query)).ThenByDescending(x => ProductSearch.Normalize(x.Title).Contains(ProductSearch.Normalize(Query), StringComparison.Ordinal));
            var all = matches.ToList(); ResultCount = all.Count; Results = all.Take(12).ToList();
        }
        ViewData["Title"] = localizer["Գտնենք ճիշտ մասը"] + localizer[" | TERMOMASTER"];
        ViewData["Description"] = localizer["Կոդով, սարքի մոդելով կամ լուսանկարով՝ սկսենք այն տվյալից, որն ունեք։"];
        ViewData["Canonical"] = "/find-part";
        ViewData["NoIndex"] = Query.Length > 0 || ModelId.Length > 0;
        ViewData["BreadcrumbData"] = seo.Breadcrumbs((localizer["Գլխավոր"], "/"), (localizer["Գտնենք ճիշտ մասը"], "/find-part"));
        return Page();
    }
    private static string Limit(string? value, int length) => (value ?? "").Trim()[..Math.Min((value ?? "").Trim().Length, length)];
    private static string Compact(string value) => ProductSearch.Normalize(value).Replace(" ", "", StringComparison.Ordinal);
    private static IEnumerable<string> Codes(Product product) => new[] { product.Sku }.Concat(product.ReplacementCodes)
        .Concat(product.Specs.Where(x => new[] { "կոդ", "code", "код", "артикул" }.Any(word => ProductSearch.Normalize(x.Key).Contains(word, StringComparison.Ordinal))).Select(x => x.Value)).Where(x => x.Length > 0);
    private static bool ExactCode(Product product, string query) => Compact(query).Length > 0 && Codes(product).Any(code => Compact(code) == Compact(query));
    private static bool MatchesCode(Product product, string query) => ProductSearch.Matches(product, query) || Compact(query).Length >= 2 && Codes(product).Any(code => Compact(code).Contains(Compact(query), StringComparison.Ordinal));
}
