using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using Jermiq.Web.Data;
using Jermiq.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace Jermiq.Web.Services;

public sealed class StoreCatalogConflictException : Exception
{
    public StoreCatalogConflictException() : base("Կատալոգը փոխվել է այլ աշխատակցի կողմից։ Թարմացրեք էջը և կրկին փորձեք։") { }
}

public sealed class StoreCatalogService(AppDbContext db, ContentLocalizer localizer, IWebHostEnvironment environment)
{
    public const string SettingsKey = "store-catalog";
    private static readonly Regex Identifier = new("^[a-z0-9][a-z0-9-]{1,79}$", RegexOptions.CultureInvariant);
    private static readonly HashSet<string> InformationPageIds =
        ["delivery", "payment", "returns", "warranty", "terms", "privacy", "about", "ordering"];

    public async Task<StoreCatalogConfiguration> GetAsync(CancellationToken ct = default, bool localized = true)
    {
        var row = await db.Settings.AsNoTracking().SingleOrDefaultAsync(x => x.Key == SettingsKey, ct);
        var result = row is null ? StaticContent.Read<StoreCatalogConfiguration>(environment, SettingsKey)
            : SiteJson.Deserialize<StoreCatalogConfiguration>(row.Value);
        result.Information ??= StaticContent.Read<StoreInformationContent>(environment, "store-information");
        BrandIdentity.Apply(result);
        if (!localized) return result;
        result.Categories = VisibleCategories(result.Categories);
        var visibleIds = result.Categories.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        result.EquipmentModels = result.EquipmentModels.Where(x => x.Published && visibleIds.Contains(x.CategoryId)).ToList();
        foreach (var category in result.Categories)
        {
            category.Title = localizer[category.Title];
            category.Description = localizer[category.Description];
        }
        result.Home.Eyebrow = localizer[result.Home.Eyebrow];
        result.Home.Title = localizer[result.Home.Title];
        result.Home.Intro = localizer[result.Home.Intro];
        result.Home.PhotoHelpTitle = localizer[result.Home.PhotoHelpTitle];
        result.Home.PhotoHelpText = localizer[result.Home.PhotoHelpText];
        result.Home.FeaturedTitle = localizer[result.Home.FeaturedTitle];
        result.Home.WholesaleTitle = localizer[result.Home.WholesaleTitle];
        result.Home.WholesaleText = localizer[result.Home.WholesaleText];
        result.PaymentText = localizer[result.PaymentText];
        result.AboutText = localizer[result.AboutText];
        foreach (var page in result.Information.Pages)
        {
            page.Intro = localizer[page.Intro];
            foreach (var section in page.Sections)
            {
                section.Title = localizer[section.Title];
                section.Body = localizer[section.Body];
            }
            foreach (var faq in page.Faqs)
            {
                faq.Question = localizer[faq.Question];
                faq.Answer = localizer[faq.Answer];
            }
        }
        result.Information.DeliveryOptions = result.Information.DeliveryOptions.Where(x => x.Published).ToList();
        foreach (var option in result.Information.DeliveryOptions)
        {
            option.Title = localizer[option.Title];
            option.PriceNote = localizer[option.PriceNote];
            option.Timeframe = localizer[option.Timeframe];
            option.Details = localizer[option.Details];
        }
        return result;
    }

    // A child of an unpublished category is unpublished regardless of its own checkbox.
    public static List<StoreCategory> VisibleCategories(IEnumerable<StoreCategory> categories)
    {
        var all = categories.ToDictionary(x => x.Id, StringComparer.Ordinal);
        bool Visible(StoreCategory item)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            while (true)
            {
                if (!item.Published || !seen.Add(item.Id)) return false;
                if (item.ParentId.Length == 0) return true;
                if (!all.TryGetValue(item.ParentId, out var parent)) return false;
                item = parent;
            }
        }
        return all.Values.Where(Visible).OrderBy(x => x.SortOrder).ThenBy(x => x.Title).ToList();
    }

    public static HashSet<string> DescendantIds(IEnumerable<StoreCategory> categories, string id)
    {
        var all = categories.ToList();
        var result = new HashSet<string>(StringComparer.Ordinal);
        if (!all.Any(x => x.Id == id)) return result;
        result.Add(id);
        var pending = new Queue<string>(); pending.Enqueue(id);
        while (pending.TryDequeue(out var parent))
            foreach (var child in all.Where(x => x.ParentId == parent))
                if (result.Add(child.Id)) pending.Enqueue(child.Id);
        return result;
    }

    public async Task<StoreCatalogConfiguration> SaveAsync(StoreCatalogConfiguration candidate, CancellationToken ct = default)
    {
        // Keep reference checks and the snapshot replacement in one SQLite write transaction.
        // A concurrent product save must not attach a category after its deletion was checked.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var row = await db.Settings.AsNoTracking().SingleAsync(x => x.Key == SettingsKey, ct);
        var previous = SiteJson.Deserialize<StoreCatalogConfiguration>(row.Value);
        if (candidate.Revision != previous.Revision) throw new StoreCatalogConflictException();
        // Older clients omit the new field. Keep an editor's saved information instead of replacing it.
        candidate.Information ??= previous.Information ?? StaticContent.Read<StoreInformationContent>(environment, "store-information");
        ValidateConfiguration(candidate);
        var categories = candidate.Categories.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        var models = candidate.EquipmentModels.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        var products = (await db.Products.AsNoTracking().ToListAsync(ct)).Select(x => SiteJson.Deserialize<Product>(x.Data)).ToList();
        if (products.Any(x => x.CatalogCategoryId.Length > 0 && !categories.Contains(x.CatalogCategoryId)))
            throw new ArgumentException("Այս բաժնում ապրանքներ կան։ Նախ տեղափոխեք դրանք այլ բաժին կամ անջատեք բաժնի հրապարակումը։");
        if (products.Any(x => x.CompatibleModelIds.Any(id => !models.Contains(id))))
            throw new ArgumentException("Այս մոդելը կապված է ապրանքների հետ։ Նախ հեռացրեք կապերը կամ անջատեք մոդելի հրապարակումը։");
        candidate.Revision = Math.Max(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), previous.Revision + 1);
        var value = SiteJson.Serialize(candidate);
        // Compare the entire stored snapshot atomically, so two editors cannot overwrite each other.
        var changed = await db.Settings.Where(x => x.Key == SettingsKey && x.Value == row.Value)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Value, value), ct);
        if (changed != 1) throw new StoreCatalogConflictException();
        await transaction.CommitAsync(ct);
        return candidate;
    }

    private static void ValidateConfiguration(StoreCatalogConfiguration candidate)
    {
        if (candidate.Categories is null || candidate.EquipmentModels is null || candidate.Home is null ||
            candidate.PaymentText is null || candidate.AboutText is null || candidate.Revision < 0 ||
            candidate.Categories.Count is < 1 or > 500 || candidate.EquipmentModels.Count > 5000 ||
            !Valid(candidate) || !Valid(candidate.Home) ||
            new[] { candidate.Home.Eyebrow, candidate.Home.Title, candidate.Home.Intro, candidate.Home.PhotoHelpTitle,
                candidate.Home.PhotoHelpText, candidate.Home.FeaturedTitle, candidate.Home.WholesaleTitle, candidate.Home.WholesaleText }.Any(x => x is null) ||
            !ProductImages.IsAllowed(candidate.Home.HeroImage))
            throw new ArgumentException("Ստուգեք գլխավոր էջի և կատալոգի տվյալները։");
        if (candidate.Categories.Any(x => x is null || !Valid(x) || x.ParentId is null || x.Description is null || !ProductImages.IsAllowed(x.Image)) ||
            candidate.Categories.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() != candidate.Categories.Count)
            throw new ArgumentException("Բաժինների կոդերը պետք է լինեն եզակի, իսկ անվանումներն ու նկարները՝ վավեր։");
        var categories = candidate.Categories.ToDictionary(x => x.Id, StringComparer.Ordinal);
        foreach (var item in candidate.Categories)
        {
            var path = new HashSet<string>(StringComparer.Ordinal) { item.Id };
            var parentId = item.ParentId;
            while (parentId.Length > 0)
            {
                if (!path.Add(parentId) || !categories.TryGetValue(parentId, out var parent))
                    throw new ArgumentException("Բաժնի ծնողը չի գտնվել կամ բաժինների ծառում շրջանաձև կապ կա։");
                parentId = parent.ParentId;
            }
            if (path.Count > 10) throw new ArgumentException("Բաժինների ծառը կարող է ունենալ առավելագույնը 10 մակարդակ։");
        }
        if (candidate.EquipmentModels.Any(x => x is null || !Valid(x) || x.Series is null || !categories.ContainsKey(x.CategoryId)) ||
            candidate.EquipmentModels.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() != candidate.EquipmentModels.Count)
            throw new ArgumentException("Սարքերի մոդելների կոդերը պետք է լինեն եզակի, իսկ բաժիններն ու անվանումները՝ վավեր։");
        ValidateInformation(candidate.Information);
    }

    private static void ValidateInformation(StoreInformationContent? information)
    {
        if (information is null || information.Pages is null || information.DeliveryOptions is null ||
            information.Pages.Count != InformationPageIds.Count || information.DeliveryOptions.Count is < 1 or > 20 ||
            information.Pages.Any(page => page is null || !Valid(page) || page.Intro is null ||
                !InformationPageIds.Contains(page.Id) || page.Sections is null || page.Faqs is null ||
                page.Sections.Count > 24 || page.Faqs.Count > 20 ||
                page.Sections.Any(section => section is null || !Valid(section) || section.Body is null) ||
                page.Faqs.Any(faq => faq is null || !Valid(faq))) ||
            information.Pages.Select(page => page.Id).Distinct(StringComparer.Ordinal).Count() != InformationPageIds.Count)
            throw new ArgumentException("Ստուգեք տեղեկատվական էջերի բաժիններն ու հաճախ տրվող հարցերը։");
        if (information.DeliveryOptions.Any(option => option is null || !Valid(option) ||
                option.PriceNote is null || option.Timeframe is null || option.Details is null) ||
            information.DeliveryOptions.Select(option => option.Id).Distinct(StringComparer.Ordinal).Count() != information.DeliveryOptions.Count)
            throw new ArgumentException("Ստուգեք առաքման տարբերակների կոդերը, արժեքներն ու պայմանները։");
    }

    public async Task<string?> ValidateProductAsync(Product product, CancellationToken ct = default)
    {
        if (product.CatalogCategoryId is null || product.Sku is null || product.Manufacturer is null ||
            product.ReplacementCodes is null || product.CompatibleModelIds is null || product.RelatedProductSlugs is null ||
            product.AlternativeProductSlugs is null || product.BundleProductSlugs is null ||
            product.ReplacementCodes.Count > 100 || product.ReplacementCodes.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 100) ||
            product.ReplacementCodes.Distinct(StringComparer.OrdinalIgnoreCase).Count() != product.ReplacementCodes.Count ||
            product.CompatibleModelIds.Count > 500 ||
            new[] { product.CompatibleModelIds, product.RelatedProductSlugs, product.AlternativeProductSlugs, product.BundleProductSlugs }
                .Any(list => list.Any(x => x is null || !Identifier.IsMatch(x)) || list.Distinct(StringComparer.Ordinal).Count() != list.Count) ||
            new[] { product.RelatedProductSlugs, product.AlternativeProductSlugs, product.BundleProductSlugs }.Any(list => list.Count > 100 || list.Contains(product.Slug)))
            return "Ստուգեք ապրանքի կոդերը, համատեղելի մոդելները և կապված ապրանքները։";
        if (product.OldPrice is not null && (product.Price is null || product.OldPrice <= product.Price))
            return "Հին գինը պետք է մեծ լինի վաճառքի գնից։";
        var config = await GetAsync(ct, false);
        if (product.CatalogCategoryId.Length > 0 && !config.Categories.Any(x => x.Id == product.CatalogCategoryId))
            return "Ընտրված կատալոգային բաժինը չի գտնվել։";
        var modelIds = config.EquipmentModels.Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        if (product.CompatibleModelIds.Any(x => !modelIds.Contains(x))) return "Ընտրված համատեղելի մոդելը չի գտնվել։";
        var rows = await db.Products.AsNoTracking().ToListAsync(ct);
        var slugs = rows.Select(x => x.Slug).ToHashSet(StringComparer.Ordinal);
        if (product.RelatedProductSlugs.Concat(product.AlternativeProductSlugs).Concat(product.BundleProductSlugs).Any(x => !slugs.Contains(x)))
            return "Կապված ապրանքներից մեկը չի գտնվել։";
        if (product.Sku.Length > 0 && rows.Where(x => x.Slug != product.Slug)
            .Any(x => string.Equals(SiteJson.Deserialize<Product>(x.Data).Sku, product.Sku, StringComparison.OrdinalIgnoreCase)))
            return "Այս արտիկուլն արդեն օգտագործվում է այլ ապրանքի համար։";
        return null;
    }

    private static bool Valid(object value) => Validator.TryValidateObject(value, new ValidationContext(value), [], true);

    public static async Task InitializeAsync(AppDbContext db, IWebHostEnvironment environment, CancellationToken ct = default)
    {
        if (await db.Settings.AnyAsync(x => x.Key == SettingsKey, ct)) return;
        var config = StaticContent.Read<StoreCatalogConfiguration>(environment, SettingsKey);
        config.Information ??= StaticContent.Read<StoreInformationContent>(environment, "store-information");
        ValidateConfiguration(config);
        config.Revision = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        db.Settings.Add(new SettingRecord { Key = SettingsKey, Value = SiteJson.Serialize(config) });
        var rows = await db.Products.ToListAsync(ct);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        foreach (var row in rows)
        {
            var p = SiteJson.Deserialize<Product>(row.Data);
            if (p.CatalogCategoryId.Length == 0) p.CatalogCategoryId = Classify(p);
            // Existing preliminary imports keep their unconfirmed codes in Specs until reviewed.
            if (!p.Demo && p.Sku.Length == 0 && p.Specs.TryGetValue("Պահեստամասի կոդ", out var code) &&
                !string.IsNullOrWhiteSpace(code) && code != "Կլրացվի" &&
                !rows.Where(x => x.Slug != row.Slug).Any(x => SiteJson.Deserialize<Product>(x.Data).Sku == code)) p.Sku = code;
            row.Data = SiteJson.Serialize(p);
            row.UpdatedAt = Math.Max(timestamp, row.UpdatedAt + 1);
        }
        await db.SaveChangesAsync(ct);
    }

    private static string Classify(Product p)
    {
        if (p.Category == "heater") return "water-heaters";
        var words = (p.Title + " " + p.Slug).ToLowerInvariant();
        if (words.Contains("անոդ") || words.Contains("anode")) return "water-heater-anodes";
        if (words.Contains("թերմոստատ") || words.Contains("thermostat")) return "water-heater-thermostats";
        if (words.Contains("միջադիր") || words.Contains("gasket")) return "water-heater-gaskets";
        if (words.Contains("փական") || words.Contains("valve")) return "water-heater-valves";
        if (words.Contains("ֆլան") || words.Contains("flange") || words.Contains("կոլբա")) return "water-heater-flanges";
        if (words.Contains("պլատա") || words.Contains("էլեկտրոն") || words.Contains("electronics") || words.Contains("board")) return "water-heater-boards";
        if (words.Contains("տէն") || words.Contains("տեն") || words.Contains("տաքացնող") || words.Contains("heating-element")) return "water-heater-elements";
        return "water-heater-parts";
    }
}
