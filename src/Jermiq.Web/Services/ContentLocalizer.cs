using System.Text.Json;
using Jermiq.Web.Data;
using Jermiq.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Jermiq.Web.Services;

public sealed class CmsContent
{
    public Dictionary<string, Dictionary<string, string>> Texts { get; set; } = [];
    public List<ServiceInfo> Services { get; set; } = [];
    public List<ArticleInfo> Articles { get; set; } = [];
    public long Revision { get; set; }
}

// Source phrases are stable keys. Editing Armenian copy does not invalidate translations.
public sealed class CmsDefaults(IWebHostEnvironment environment)
{
    public CmsContent Content { get; } = ContentLocalizer.Defaults(environment);
    // Detailed policies are localized on the server and through the catalog API.
    // Keep their prose out of the UI dictionary embedded in every storefront page.
    public HashSet<string> ServerRenderedTexts { get; } = StaticContent
        .Read<StoreInformationContent>(environment, "store-information").Pages
        .SelectMany(page => new[] { page.Intro }
            .Concat(page.Sections.Select(section => section.Body))
            .Concat(page.Faqs.Select(faq => faq.Answer)))
        .ToHashSet(StringComparer.Ordinal);
    public CmsContent Create() => SiteJson.Deserialize<CmsContent>(SiteJson.Serialize(Content));
}

public sealed class ContentLocalizer(CmsDefaults defaults)
{
    public static readonly string[] Languages = ["hy", "en", "ru"];
    public string Language { get; private set; } = "hy";
    public string Culture => Language switch { "en" => "en-US", "ru" => "ru-RU", _ => "hy-AM" };
    public CmsContent Content { get; private set; } = new();
    public string this[string source] => Translate(source);
    public string Translate(string source)
    {
        source = BrandIdentity.Text(source);
        if (Content.Texts.TryGetValue(source, out var values))
        {
            if (values.TryGetValue(Language, out var translated) && !string.IsNullOrWhiteSpace(translated)) return BrandIdentity.Text(translated);
            if (values.TryGetValue("hy", out var original) && !string.IsNullOrWhiteSpace(original)) return BrandIdentity.Text(original);
        }
        return source;
    }
    public async Task LoadAsync(HttpContext context, AppDbContext db)
    {
        var requested = context.Request.Query["lang"].ToString();
        var cookie = context.Request.Cookies["Jermiq.Language"];
        Language = Languages.Contains(requested) ? requested : Languages.Contains(cookie) ? cookie! : "hy";
        if (Languages.Contains(requested)) context.Response.Cookies.Append("Jermiq.Language", requested,
            new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Lax, Secure = context.Request.IsHttps, MaxAge = TimeSpan.FromDays(365), IsEssential = true });
        var row = await db.Settings.AsNoTracking().SingleOrDefaultAsync(x => x.Key == "cms", context.RequestAborted);
        Content = row is null ? defaults.Create() : SiteJson.Deserialize<CmsContent>(row.Value);
        BrandIdentity.Apply(Content);
        // Seed additions remain available after an older CMS record has been saved.
        foreach (var pair in defaults.Content.Texts) Content.Texts.TryAdd(pair.Key, new Dictionary<string, string>(pair.Value));
    }
    public Dictionary<string, string> ClientTexts => Content.Texts
        .Where(x => !defaults.ServerRenderedTexts.Contains(x.Key))
        .ToDictionary(x => x.Key, x => Translate(x.Key));
    public static CmsContent Defaults(IWebHostEnvironment env) => new()
    {
        Texts = StaticContent.Read<Dictionary<string, Dictionary<string, string>>>(env, "translations"),
        Services = StaticContent.Read<List<ServiceInfo>>(env, "services"),
        Articles = StaticContent.Read<List<ArticleInfo>>(env, "articles")
    };
    public string Link(string path, string? language = null)
    {
        if (!path.StartsWith('/') || path.StartsWith("//") || path.StartsWith("/api/") || path.StartsWith("/admin/logout")) return path;
        var fragmentAt = path.IndexOf('#');
        var fragment = fragmentAt >= 0 ? path[fragmentAt..] : "";
        var clean = fragmentAt >= 0 ? path[..fragmentAt] : path;
        var queryAt = clean.IndexOf('?');
        var root = queryAt >= 0 ? clean[..queryAt] : clean;
        var query = queryAt >= 0 ? Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(clean[queryAt..]) : new();
        query["lang"] = language ?? Language;
        return Microsoft.AspNetCore.WebUtilities.QueryHelpers.AddQueryString(root, query) + fragment;
    }
}
