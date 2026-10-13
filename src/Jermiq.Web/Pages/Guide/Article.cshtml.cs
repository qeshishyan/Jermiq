using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Guide;

public sealed class ArticleModel(StaticContent content, SeoService seo, ContentLocalizer localizer) : PageModel
{
    public ArticleInfo Article { get; private set; } = null!;
    public IActionResult OnGet(string slug)
    {
        var article = content.Articles.SingleOrDefault(x => x.Slug == slug);
        if (article is null) return NotFound();
        Article = article;
        ViewData["Title"] = article.Title + localizer[" | Ջերմիք"];
        ViewData["Description"] = article.Intro;
        ViewData["Canonical"] = "/guide/" + slug;
        ViewData["OgType"] = "article";
        ViewData["StructuredData"] = seo.Article(article);
        ViewData["BreadcrumbData"] = seo.Breadcrumbs((localizer["Գլխավոր"], "/"), (localizer["Օգտակար նյութեր"], "/guide"), (article.Title, "/guide/" + slug));
        return Page();
    }
}
