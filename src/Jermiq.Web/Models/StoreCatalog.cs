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
