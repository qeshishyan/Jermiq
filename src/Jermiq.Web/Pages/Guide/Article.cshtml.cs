using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Guide;

public sealed class ArticleModel(StaticContent content, SeoService seo) : PageModel
{
    public ArticleInfo Article { get; private set; } = null!;
    public IActionResult OnGet(string slug)
    {
        var article = content.Articles.SingleOrDefault(x => x.Slug == slug);
        if (article is null) return NotFound();
        Article = article;
        ViewData["Title"] = article.Title + " | Ջերմիք";
        ViewData["Description"] = article.Intro;
        ViewData["Canonical"] = "/guide/" + slug;
        ViewData["OgType"] = "article";
        ViewData["StructuredData"] = seo.Article(article);
        ViewData["BreadcrumbData"] = seo.Breadcrumbs(("Գլխավոր", "/"), ("Օգտակար նյութեր", "/guide"), (article.Title, "/guide/" + slug));
        return Page();
    }
}
