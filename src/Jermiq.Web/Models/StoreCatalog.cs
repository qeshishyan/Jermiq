using System.ComponentModel.DataAnnotations;

namespace Jermiq.Web.Models;

// Catalog identifiers and product links are language-independent. Texts use the existing CMS localizer.
public sealed class StoreCatalogConfiguration
{
    public long Revision { get; set; }
    public List<StoreCategory> Categories { get; set; } = [];
    public List<EquipmentModel> EquipmentModels { get; set; } = [];
    public StoreHomeContent Home { get; set; } = new();
    [StringLength(6000)] public string PaymentText { get; set; } = "";
    [StringLength(6000)] public string AboutText { get; set; } = "";
    // Null keeps saved snapshots and older admin clients compatible with new information defaults.
    public StoreInformationContent? Information { get; set; }
}

public sealed class StoreInformationContent
{
    public List<StoreInformationPage> Pages { get; set; } = [];
    public List<StoreDeliveryOption> DeliveryOptions { get; set; } = [];
}

public sealed class StoreInformationPage
{
    [Required, StringLength(80)] public string Id { get; set; } = "";
    [StringLength(2000)] public string Intro { get; set; } = "";
    public List<StoreInformationSection> Sections { get; set; } = [];
    public List<StoreInformationFaq> Faqs { get; set; } = [];
}

public sealed class StoreInformationSection
{
    [Required, StringLength(200)] public string Title { get; set; } = "";
    [StringLength(6000)] public string Body { get; set; } = "";
}

public sealed class StoreInformationFaq
{
    [Required, StringLength(300)] public string Question { get; set; } = "";
    [Required, StringLength(4000)] public string Answer { get; set; } = "";
}

public sealed class StoreDeliveryOption
{
    [Required, RegularExpression("^[a-z0-9][a-z0-9-]{1,79}$")] public string Id { get; set; } = "";
    [Required, StringLength(200)] public string Title { get; set; } = "";
    [Range(typeof(decimal), "0", "1000000000")] public decimal? Price { get; set; }
    public bool PriceIsFrom { get; set; }
    [Range(typeof(decimal), "0", "1000000000")] public decimal? FreeFrom { get; set; }
    [StringLength(600)] public string PriceNote { get; set; } = "";
    [StringLength(500)] public string Timeframe { get; set; } = "";
    [StringLength(2000)] public string Details { get; set; } = "";
    public bool Published { get; set; } = true;
}

public sealed class StoreCategory
{
    [Required, RegularExpression("^[a-z0-9][a-z0-9-]{1,79}$")] public string Id { get; set; } = "";
    [StringLength(80)] public string ParentId { get; set; } = "";
    [Required, StringLength(160, MinimumLength = 2)] public string Title { get; set; } = "";
    [StringLength(1500)] public string Description { get; set; } = "";
    [StringLength(1000)] public string Image { get; set; } = "/images/parts.webp";
    [Range(0, 100000)] public int SortOrder { get; set; }
    public bool Published { get; set; } = true;
}

public sealed class EquipmentModel
{
    [Required, RegularExpression("^[a-z0-9][a-z0-9-]{1,79}$")] public string Id { get; set; } = "";
    [Required, StringLength(80)] public string CategoryId { get; set; } = "";
    [Required, StringLength(160)] public string Brand { get; set; } = "";
    [StringLength(160)] public string Series { get; set; } = "";
    [Required, StringLength(200)] public string Name { get; set; } = "";
    public bool Published { get; set; } = true;
}

public sealed class StoreHomeContent
{
    [StringLength(160)] public string Eyebrow { get; set; } = "";
    [Required, StringLength(300)] public string Title { get; set; } = "";
    [StringLength(1500)] public string Intro { get; set; } = "";
    [StringLength(1000)] public string HeroImage { get; set; } = "/images/parts.webp";
    [StringLength(200)] public string PhotoHelpTitle { get; set; } = "";
    [StringLength(1500)] public string PhotoHelpText { get; set; } = "";
    [StringLength(160)] public string FeaturedTitle { get; set; } = "";
    [StringLength(200)] public string WholesaleTitle { get; set; } = "";
    [StringLength(1500)] public string WholesaleText { get; set; } = "";
}
