using System.Text.RegularExpressions;
using Jermiq.Web.Models;

namespace Jermiq.Web.Services;

public static class BrandIdentity
{
    public const string Name = "TERMOMASTER";
    public const string Tagline = "Էլեկտրական ջրատաքացուցիչների կենտրոն";
    public const string Promise = "Տաք ջուր՝ վստահ ամեն օր";
    public const string Description = "Էլեկտրական ջրատաքացուցիչների վաճառք, տեղադրում, սպասարկում և պահեստամասեր։";
    public const string MarkPath = "/images/brand/termomaster-mark.png";
    public const string LogoPath = "/images/brand/termomaster-logo.svg";
    public const string SocialImagePath = "/images/brand/termomaster-social.png";

    // Public copy can be older than the current deployment. Do not rename URLs,
    // email addresses, storage identifiers, products' codes or application files.
    private static readonly Regex LegacyName = new(
        @"(?<![\p{L}\p{N}_@./-])(?:Ջերմիք(?<suffix>ին|ից|ով|ում|ի|ը)?|JERMIQ)(?![\p{L}\p{N}_@./-])",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static string Text(string value) => LegacyName.Replace(value, match =>
        Name + (match.Groups["suffix"].Success ? "-" + match.Groups["suffix"].Value : ""));

    public static void Apply(CmsContent content)
    {
        var texts = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
        // If both versions exist, the explicitly saved current-name entry wins.
        foreach (var pair in content.Texts.OrderBy(pair => pair.Key == Text(pair.Key) ? 1 : 0))
            texts[Text(pair.Key)] = pair.Value.ToDictionary(value => value.Key, value => Text(value.Value));
        content.Texts = texts;
        content.Services = content.Services.Select(service => service with { Title = Text(service.Title), Desc = Text(service.Desc) }).ToList();
        content.Articles = content.Articles.Select(article => article with
        {
            Title = Text(article.Title), Intro = Text(article.Intro),
            Sections = article.Sections.Select(section => section.Select(Text).ToArray()).ToList()
        }).ToList();
    }

    public static void Apply(StoreCatalogConfiguration store)
    {
        foreach (var category in store.Categories)
        { category.Title = Text(category.Title); category.Description = Text(category.Description); }
        var home = store.Home;
        home.Eyebrow = Text(home.Eyebrow); home.Title = Text(home.Title); home.Intro = Text(home.Intro);
        home.PhotoHelpTitle = Text(home.PhotoHelpTitle); home.PhotoHelpText = Text(home.PhotoHelpText);
        home.FeaturedTitle = Text(home.FeaturedTitle); home.WholesaleTitle = Text(home.WholesaleTitle); home.WholesaleText = Text(home.WholesaleText);
        store.PaymentText = Text(store.PaymentText); store.AboutText = Text(store.AboutText);
        if (store.Information is not { } information) return;
        foreach (var page in information.Pages)
        {
            page.Intro = Text(page.Intro);
            foreach (var section in page.Sections) { section.Title = Text(section.Title); section.Body = Text(section.Body); }
            foreach (var faq in page.Faqs) { faq.Question = Text(faq.Question); faq.Answer = Text(faq.Answer); }
        }
        foreach (var option in information.DeliveryOptions)
        {
            option.Title = Text(option.Title); option.PriceNote = Text(option.PriceNote);
            option.Timeframe = Text(option.Timeframe); option.Details = Text(option.Details);
        }
    }
}
