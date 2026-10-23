using System.Xml.Linq;
using Jermiq.Web.Models;

namespace Jermiq.Web.Services;

public sealed class SeoService
{
    public string BaseUrl { get; }
    public bool IndexingEnabled { get; }
    private readonly ContentLocalizer localizer;
    public SeoService(IConfiguration config, IWebHostEnvironment environment, ContentLocalizer localizer)
    {
        this.localizer = localizer;
        BaseUrl = (config["Seo:BaseUrl"] ?? "http://localhost:5080").TrimEnd('/');
        if (!Uri.TryCreate(BaseUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http") ||
            !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment) || uri.AbsolutePath != "/")
            throw new InvalidOperationException("Seo:BaseUrl must be an absolute site origin without a path or query.");
        IndexingEnabled = config.GetValue<bool>("Seo:IndexingEnabled") && !environment.IsDevelopment();
    }
    public string Url(string path) => ProductImages.IsExternal(path) ? path : BaseUrl + (path.StartsWith('/') ? path : "/" + path);
    public string PageUrl(string path) => Url(localizer.Language == "hy" ? path : localizer.Link(path));
    public object Organization(SiteSettings s)
    {
        var result = new Dictionary<string, object>
        {
            ["@context"] = "https://schema.org", ["@type"] = "Organization", ["name"] = localizer["Ջերմիք"],
            ["url"] = BaseUrl, ["logo"] = Url("/logo.svg")
        };
        if (!string.IsNullOrWhiteSpace(s.Phone)) result["telephone"] = s.Phone;
        if (!string.IsNullOrWhiteSpace(s.Email)) result["email"] = s.Email;
        if (!string.IsNullOrWhiteSpace(s.Address)) result["address"] = s.Address;
        return result;
    }
    public object Breadcrumbs(params (string Name, string Path)[] items) => new Dictionary<string, object>
    {
        ["@context"] = "https://schema.org", ["@type"] = "BreadcrumbList",
        ["itemListElement"] = items.Select((item, index) => new Dictionary<string, object>
        { ["@type"] = "ListItem", ["position"] = index + 1, ["name"] = item.Name, ["item"] = PageUrl(item.Path) }).ToArray()
    };
    public object Product(Product p)
    {
        var data = new Dictionary<string, object>
        {
            ["@context"] = "https://schema.org", ["@type"] = "Product", ["name"] = p.Title,
            ["description"] = p.Description, ["image"] = p.Gallery.Select(Url).ToArray(), ["url"] = PageUrl("/products/" + p.Slug)
        };
        if (!string.IsNullOrWhiteSpace(p.Brand)) data["brand"] = new Dictionary<string, string> { ["@type"] = "Brand", ["name"] = p.Brand };
        if (!string.IsNullOrWhiteSpace(p.Model)) data["model"] = p.Model;
        if (!string.IsNullOrWhiteSpace(p.Sku)) data["sku"] = p.Sku;
        if (p.Price is not null && !p.PriceIsEstimate) data["offers"] = new Dictionary<string, object>
        {
            ["@type"] = "Offer", ["price"] = p.Price.Value, ["priceCurrency"] = "AMD", ["url"] = PageUrl("/products/" + p.Slug)
        };
        return data;
    }
    public object Article(ArticleInfo a) => new Dictionary<string, object>
    {
        ["@context"] = "https://schema.org", ["@type"] = "Article", ["headline"] = a.Title,
        ["description"] = a.Intro, ["inLanguage"] = localizer.Language, ["mainEntityOfPage"] = PageUrl("/guide/" + a.Slug),
        ["author"] = new Dictionary<string, string> { ["@type"] = "Organization", ["name"] = localizer["Ջերմիք"] }
    };
}

public static class SeoEndpoints
{
    public static void MapSeoEndpoints(this WebApplication app)
    {
        app.MapGet("/robots.txt", (SeoService seo) => Results.Text(seo.IndexingEnabled
            ? $"User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: {seo.Url("/sitemap.xml")}\n"
            : $"User-agent: *\nDisallow: /\nSitemap: {seo.Url("/sitemap.xml")}\n", "text/plain; charset=utf-8"));
        app.MapGet("/sitemap.xml", async (SeoService seo, CatalogService catalog, StoreCatalogService store, StaticContent content, CancellationToken ct) =>
        {
            XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
            var config = await store.GetAsync(ct);
            var paths = new[] { "", "/catalog", "/parts", "/selection", "/find-part", "/services", "/warranty", "/contact", "/guide", "/delivery", "/payment", "/about", "/ordering", "/returns", "/terms", "/privacy" }
                .Concat(config.Categories.Select(c => "/catalog?category=" + Uri.EscapeDataString(c.Id)))
                .Concat(content.Articles.Select(x => "/guide/" + x.Slug))
                .Concat((await catalog.GetProductsAsync(ct)).Where(x => !x.Demo).Select(x => "/products/" + x.Slug));
            var xml = new XDocument(new XDeclaration("1.0", "utf-8", null),
                new XElement(ns + "urlset", paths.Distinct().SelectMany(path => new[] { path, path + (path.Contains('?') ? "&" : "?") + "lang=en", path + (path.Contains('?') ? "&" : "?") + "lang=ru" }).Select(path => new XElement(ns + "url", new XElement(ns + "loc", seo.Url(path)),
                    new XElement(ns + "changefreq", "monthly"), new XElement(ns + "priority", path == "" ? "1.0" : "0.7")))));
            return Results.Text(xml.ToString(), "application/xml; charset=utf-8");
        });
    }
}
