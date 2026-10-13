using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages;

public sealed class SitePageModel(CatalogService catalog, StaticContent content, SeoService seo) : PageModel
{
    public string PageName { get; private set; } = "home";
    public string Title { get; private set; } = "";
    public string Description { get; private set; } = "";
    public SiteSettings Settings { get; private set; } = new();
    public List<Product> Products { get; private set; } = [];
    public IReadOnlyList<ServiceInfo> Services => content.Services;
    public IReadOnlyList<ArticleInfo> Articles => content.Articles;
    public string Query { get; private set; } = "";
    public string? Category => PageName == "parts" ? "part" : Query.Length > 0 ? null : "heater";
    public async Task<IActionResult> OnGetAsync(string? pageName, string? q, CancellationToken ct)
    {
        PageName = string.IsNullOrEmpty(pageName) ? "home" : pageName.ToLowerInvariant();
        (Title, Description) = PageName switch
        {
            "home" => ("Ջերմիք — ջրատաքացուցիչներ, պահեստամասեր և սպասարկում", "Էլեկտրական ջրատաքացուցիչների ընտրություն, պահեստամասեր, վերանորոգում և սպասարկում։ Սպասարկում ենք նաև այլ տեղից գնված սարքերը։"),
            "catalog" => ("Ջրատաքացուցիչներ", "Համեմատեք տարբերակները և ընտրեք ձեր տան համար։ Եթե դժվարանում եք, կօգնենք հասկանալ՝ ինչն է համապատասխանում ձեր կարիքներին։"),
            "parts" => ("Պահեստամասեր", "Ճիշտ պահեստամասը սկսվում է ճիշտ համատեղելիությունից։ Որոնեք անվանումով կամ ուղարկեք ձեր սարքի մոդելը։"),
            "services" => ("Սպասարկում և վերանորոգում", "Դիմեք՝ անկախ նրանից, թե որտեղից եք գնել ձեր ջրատաքացուցիչը։ Աշխատանքի ծավալն ու արժեքը նախապես համաձայնեցնում ենք ձեզ հետ։"),
            "warranty" => ("Երաշխիք՝ հստակ պայմաններով", "Ապրանքի երաշխիքն ու կատարված աշխատանքի երաշխիքը ներկայացվում են առանձին՝ համապատասխան փաստաթղթերով։"),
            "guide" => ("Օգտակար նյութեր", "Ընտրության, պահեստամասերի և սպասարկման մասին՝ պարզ լեզվով։"),
            "contact" => ("Կապ մեզ հետ", "Ունե՞ք հարց ապրանքի, պահեստամասի կամ սպասարկման մասին։ Գրեք մեզ կամ թողեք ձեր հեռախոսը։"),
            "privacy" => ("Գաղտնիության պայմաններ", "Հայտերի միջոցով ստացված տվյալների մշակման և պահպանման պայմանները։"),
            _ => ("", "")
        };
        if (Title.Length == 0) return NotFound();
        Query = (q ?? "").Length > 200 ? q![..200] : q ?? "";
        Products = await catalog.GetProductsAsync(ct);
        Settings = await catalog.GetSettingsAsync(ct);
        var canonicalPath = PageName == "home" ? "/" : "/" + PageName;
        ViewData["Title"] = PageName == "home" ? Title : Title + " | Ջերմիք";
        ViewData["Description"] = Description;
        ViewData["Canonical"] = canonicalPath;
        ViewData["NoIndex"] = Query.Length > 0;
        ViewData["StructuredData"] = PageName == "home" ? null : seo.Breadcrumbs(("Գլխավոր", "/"), (Title, canonicalPath));
        return Page();
    }
    public bool Matches(Product p) => (Category is null || p.Category == Category) &&
        string.Join(' ', new[] { p.Title, p.Description, p.Brand, p.Model, p.Slug }.Concat(p.Specs.Values))
            .Contains(Query, StringComparison.OrdinalIgnoreCase);
}
