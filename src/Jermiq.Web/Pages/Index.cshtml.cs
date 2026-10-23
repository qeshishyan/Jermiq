using System.Globalization;
using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Primitives;

namespace Jermiq.Web.Pages;

public sealed class SitePageModel(CatalogService catalog, StoreCatalogService store, StaticContent content, SeoService seo, ContentLocalizer localizer) : PageModel
{
    public string PageName { get; private set; } = "home";
    public string Title { get; private set; } = "";
    public string Description { get; private set; } = "";
    public SiteSettings Settings { get; private set; } = new();
    public StoreCatalogConfiguration Store { get; private set; } = new();
    public List<Product> Products { get; private set; } = [];
    public List<Product> CatalogProducts { get; private set; } = [];
    public List<Product> Results { get; private set; } = [];
    public IReadOnlyList<ServiceInfo> Services => content.Services;
    public IReadOnlyList<ArticleInfo> Articles => content.Articles;
    public string Query { get; private set; } = "";
    public string CategoryId { get; private set; } = "";
    public StoreCategory? SelectedCategory { get; private set; }
    public string Brand { get; private set; } = "";
    public string ModelId { get; private set; } = "";
    public string Sort { get; private set; } = "popular";
    public decimal? MinPrice { get; private set; }
    public decimal? MaxPrice { get; private set; }
    public int PageNumber { get; private set; } = 1;
    public int PageCount => Math.Max(1, (int)Math.Ceiling(ResultCount / 12d));
    public int ResultCount { get; private set; }
    public List<string> SelectedSpecs { get; private set; } = [];
    public string? Category => PageName == "parts" ? "part" : null;
    public IEnumerable<StoreCategory> RootCategories => Store.Categories.Where(x => x.ParentId.Length == 0).OrderBy(x => x.SortOrder).ThenBy(x => x.Title);
    public IEnumerable<StoreCategory> Children(string id) => Store.Categories.Where(x => x.ParentId == id).OrderBy(x => x.SortOrder).ThenBy(x => x.Title);
    public string CategoryUrl(StoreCategory category) => "/catalog?category=" + Uri.EscapeDataString(category.Id);
    public IEnumerable<EquipmentModel> SelectionModels => Store.EquipmentModels.Where(x => CategoryId.Length == 0 || Descendants(CategoryId).Contains(x.CategoryId));

    public async Task<IActionResult> OnGetAsync(string? pageName, string? q, CancellationToken ct)
    {
        PageName = string.IsNullOrEmpty(pageName) ? "home" : pageName.ToLowerInvariant();
        (Title, Description) = PageName switch
        {
            "home" => (localizer["TERMOMASTER — էլեկտրական ջրատաքացուցիչների կենտրոն"], localizer["Գտեք ձեր սարքի պահեստամասը՝ ըստ տեսակի, կոդի կամ մոդելի։ Ջրատաքացուցիչներ և մասնագիտական սպասարկում մեկ տեղում։"]),
            "catalog" => (localizer["Ամբողջ տեսականին"], localizer["Ջրատաքացուցիչներ և սարքավորումների պահեստամասեր։ Ընտրեք կատեգորիան կամ որոնեք մասի կոդով։"]),
            "parts" => (localizer["Պահեստամասեր"], localizer["ՏԷՆ-եր, անոդներ, թերմոստատներ և այլ պահեստամասեր՝ ձեր սարքի համար։"]),
            "selection" => (localizer["Ընտրել սարքի մոդելով"], localizer["Ընտրեք սարքի տեսակը, բրենդը և մոդելը՝ համապատասխան պահեստամասերը տեսնելու համար։"]),
            "delivery" => (localizer["Առաքում և ինքնավերցում"], localizer["Պատվերի ստացման եղանակներն ու առաքման պայմանները։"]),
            "payment" => (localizer["Վճարման պայմաններ"], localizer["Պատվերի գնի հաստատումն ու վճարման եղանակները։"]),
            "about" => (localizer["TERMOMASTER-ի մասին"], localizer["Պահեստամասերի ընտրությունից մինչև սարքի սպասարկում։"]),
            "returns" => (localizer["Վերադարձ և փոխանակում"], localizer["Վերադարձի, փոխանակման և թերության դեպքում դիմելու կարգը՝ պարզ քայլերով։"]),
            "terms" => (localizer["Գնման պայմաններ"], localizer["Ապրանքի ընտրությունից մինչև պատվերի հաստատում․ գներ, առկայություն և կողմերի համաձայնեցումներ։"]),
            "ordering" => (localizer["Ինչպես պատվիրել"], localizer["Գտեք ճիշտ ապրանքը, ուղարկեք հայտը և հաստատեք ստացման պայմանները։"]),
            "favorites" => (localizer["Ընտրյալներ"], localizer["Պահպանված ապրանքները՝ ձեր հաջորդ ընտրության համար։"]),
            "compare" => (localizer["Համեմատություն"], localizer["Համեմատեք ընտրված ապրանքների տեխնիկական տվյալները։"]),
            "cart" => (localizer["Ձեր պատվերի ցանկը"], localizer["Ստուգեք ընտրված ապրանքներն ու քանակները և ուղարկեք պատվերը։"]),
            "services" => (localizer["Սպասարկում և վերանորոգում"], localizer["Դիմեք՝ անկախ նրանից, թե որտեղից եք գնել ձեր ջրատաքացուցիչը։ Աշխատանքի ծավալն ու արժեքը նախապես համաձայնեցնում ենք ձեզ հետ։"]),
            "warranty" => (localizer["Երաշխիք՝ հստակ պայմաններով"], localizer["Ապրանքի երաշխիքն ու կատարված աշխատանքի երաշխիքը ներկայացվում են առանձին՝ համապատասխան փաստաթղթերով։"]),
            "guide" => (localizer["Օգտակար նյութեր"], localizer["Ընտրության, պահեստամասերի և սպասարկման մասին՝ պարզ լեզվով։"]),
            "contact" => (localizer["Կապ մեզ հետ"], localizer["Ունե՞ք հարց ապրանքի, պահեստամասի կամ սպասարկման մասին։ Գրեք մեզ կամ թողեք ձեր հեռախոսը։"]),
            "privacy" => (localizer["Գաղտնիության պայմաններ"], localizer["Հայտերի միջոցով ստացված տվյալների մշակման և պահպանման պայմանները։"]),
            _ => ("", "")
        };
        if (Title.Length == 0) return NotFound();
        Query = Limit(q, 200);
        CategoryId = Limit(Request.Query["category"].ToString(), 80);
        Brand = Limit(Request.Query["brand"].ToString(), 200);
        ModelId = Limit(Request.Query["model"].ToString(), 80);
        Sort = new[] { "popular", "price", "price-desc", "title", "new" }.Contains(Request.Query["sort"].ToString()) ? Request.Query["sort"].ToString() : "popular";
        MinPrice = Price(Request.Query["min"].ToString());
        MaxPrice = Price(Request.Query["max"].ToString());
        SelectedSpecs = Request.Query["spec"].Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x!).Select(x => x[..Math.Min(x.Length, 400)]).Distinct().Take(20).ToList();
        Store = await store.GetAsync(ct);
        SelectedCategory = Store.Categories.FirstOrDefault(x => x.Id == CategoryId);
        if (CategoryId.Length > 0 && SelectedCategory is null) return NotFound();
        Products = await catalog.GetProductsAsync(ct);
        Settings = await catalog.GetSettingsAsync(ct);
        if (SelectedCategory is not null && PageName is "catalog" or "parts")
        {
            Title = SelectedCategory.Title;
            Description = SelectedCategory.Description.Length > 0 ? SelectedCategory.Description : Description;
        }
        var categoryIds = CategoryId.Length > 0 ? Descendants(CategoryId) : null;
        CatalogProducts = Products.Where(p => (Category is null || p.Category == Category) && (categoryIds is null || categoryIds.Contains(p.CatalogCategoryId))).ToList();
        var filtered = CatalogProducts.Where(Matches);
        filtered = Sort switch
        {
            "price" => filtered.OrderBy(x => x.Price is null).ThenBy(x => x.Price).ThenBy(x => x.Title),
            "price-desc" => filtered.OrderBy(x => x.Price is null).ThenByDescending(x => x.Price).ThenBy(x => x.Title),
            "title" => filtered.OrderBy(x => x.Title),
            "new" => filtered.OrderByDescending(x => x.IsNew).ThenByDescending(x => x.Revision),
            _ => filtered.OrderByDescending(x => Query.Length > 0 && ProductSearch.Normalize(x.Sku) == ProductSearch.Normalize(Query)).ThenByDescending(x => x.IsFeatured).ThenBy(x => x.Title)
        };
        var allResults = filtered.ToList();
        ResultCount = allResults.Count;
        PageNumber = Math.Clamp(int.TryParse(Request.Query["pageNumber"], out var requestedPage) ? requestedPage : 1, 1, PageCount);
        Results = allResults.Skip((PageNumber - 1) * 12).Take(12).ToList();
        var canonicalPath = PageName == "home" ? "/" : "/" + PageName;
        if (CategoryId.Length > 0 && PageName is "catalog" or "parts") canonicalPath = "/catalog?category=" + Uri.EscapeDataString(CategoryId);
        ViewData["Title"] = PageName == "home" ? Title : Title + localizer[" | TERMOMASTER"];
        ViewData["Description"] = Description;
        ViewData["Canonical"] = canonicalPath;
        ViewData["NoIndex"] = Query.Length > 0 || Brand.Length > 0 || ModelId.Length > 0 || SelectedSpecs.Count > 0 || MinPrice is not null || MaxPrice is not null || PageNumber > 1 || Sort != "popular" || PageName is "favorites" or "compare" or "cart";
        ViewData["StructuredData"] = PageName == "home" ? null : seo.Breadcrumbs((localizer["Գլխավոր"], "/"), (Title, canonicalPath));
        return Page();
    }
    public bool Matches(Product p) => MatchesSearch(p) &&
        (Brand.Length == 0 || string.Equals(p.Brand, Brand, StringComparison.OrdinalIgnoreCase)) &&
        (ModelId.Length == 0 || p.CompatibleModelIds.Contains(ModelId)) &&
        (MinPrice is null || p.Price >= MinPrice) && (MaxPrice is null || p.Price <= MaxPrice) &&
        SelectedSpecs.GroupBy(x => x.Split(':', 2)[0]).All(group => group.Any(value =>
        {
            var parts = value.Split(':', 2);
            return parts.Length == 2 && p.Specs.TryGetValue(parts[0], out var spec) && spec == parts[1];
        }));
    private bool MatchesSearch(Product product)
    {
        var modelText = ProductSearch.Normalize(string.Join(' ', Store.EquipmentModels.Where(x => product.CompatibleModelIds.Contains(x.Id)).Select(x => x.Brand + " " + x.Series + " " + x.Name)));
        return ProductSearch.Normalize(Query).Split(' ', StringSplitOptions.RemoveEmptyEntries).All(word => ProductSearch.Matches(product, word) || modelText.Contains(word, StringComparison.Ordinal));
    }
    public HashSet<string> Descendants(string id)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal) { id };
        for (var added = true; added;)
        {
            added = false;
            foreach (var c in Store.Categories.Where(x => ids.Contains(x.ParentId))) added |= ids.Add(c.Id);
        }
        return ids;
    }
    public string CatalogUrl(string? key = null, string? value = null)
    {
        var query = Request.Query.ToDictionary(x => x.Key, x => x.Value);
        if (key == "price-range") { query.Remove("min"); query.Remove("max"); query.Remove("pageNumber"); return QueryHelpers.AddQueryString("/" + PageName, query); }
        if (key is not null) { query.Remove("pageNumber"); if (string.IsNullOrEmpty(value)) query.Remove(key); else query[key] = new StringValues(value); }
        return QueryHelpers.AddQueryString("/" + PageName, query);
    }
    private static string Limit(string? value, int length) => (value ?? "").Trim()[..Math.Min((value ?? "").Trim().Length, length)];
    private static decimal? Price(string? value) => decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var number) && number >= 0 ? number : null;
}
