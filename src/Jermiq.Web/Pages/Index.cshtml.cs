using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages;

public sealed class SitePageModel(CatalogService catalog, StaticContent content, SeoService seo, ContentLocalizer localizer) : PageModel
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
            "home" => (localizer["Ջերմիք — ջրատաքացուցիչներ, պահեստամասեր և սպասարկում"], localizer["Էլեկտրական ջրատաքացուցիչների ընտրություն, պահեստամասեր, վերանորոգում և սպասարկում։ Սպասարկում ենք նաև այլ տեղից գնված սարքերը։"]),
            "catalog" => (localizer["Ջրատաքացուցիչներ"], localizer["Համեմատեք տարբերակները և ընտրեք ձեր տան համար։ Եթե դժվարանում եք, կօգնենք հասկանալ՝ ինչն է համապատասխանում ձեր կարիքներին։"]),
            "parts" => (localizer["Պահեստամասեր"], localizer["Ճիշտ պահեստամասը սկսվում է ճիշտ համատեղելիությունից։ Որոնեք անվանումով կամ ուղարկեք ձեր սարքի մոդելը։"]),
            "services" => (localizer["Սպասարկում և վերանորոգում"], localizer["Դիմեք՝ անկախ նրանից, թե որտեղից եք գնել ձեր ջրատաքացուցիչը։ Աշխատանքի ծավալն ու արժեքը նախապես համաձայնեցնում ենք ձեզ հետ։"]),
            "warranty" => (localizer["Երաշխիք՝ հստակ պայմաններով"], localizer["Ապրանքի երաշխիքն ու կատարված աշխատանքի երաշխիքը ներկայացվում են առանձին՝ համապատասխան փաստաթղթերով։"]),
            "guide" => (localizer["Օգտակար նյութեր"], localizer["Ընտրության, պահեստամասերի և սպասարկման մասին՝ պարզ լեզվով։"]),
            "contact" => (localizer["Կապ մեզ հետ"], localizer["Ունե՞ք հարց ապրանքի, պահեստամասի կամ սպասարկման մասին։ Գրեք մեզ կամ թողեք ձեր հեռախոսը։"]),
            "privacy" => (localizer["Գաղտնիության պայմաններ"], localizer["Հայտերի միջոցով ստացված տվյալների մշակման և պահպանման պայմանները։"]),
            _ => ("", "")
        };
        if (Title.Length == 0) return NotFound();
        Query = (q ?? "").Length > 200 ? q![..200] : (q ?? "").Trim();
        Products = await catalog.GetProductsAsync(ct);
        Settings = await catalog.GetSettingsAsync(ct);
        var canonicalPath = PageName == "home" ? "/" : "/" + PageName;
        ViewData["Title"] = PageName == "home" ? Title : Title + localizer[" | Ջերմիք"];
        ViewData["Description"] = Description;
        ViewData["Canonical"] = canonicalPath;
        ViewData["NoIndex"] = Query.Length > 0;
        ViewData["StructuredData"] = PageName == "home" ? null : seo.Breadcrumbs((localizer["Գլխավոր"], "/"), (Title, canonicalPath));
        return Page();
    }
    public bool Matches(Product p) => (Category is null || p.Category == Category) &&
        ProductSearch.Matches(p, Query);
}
