using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Jermiq.Web.Models;

// The JSON contract preserves the fields from the original React/Sites catalog.
public sealed class Product
{
    public long Revision { get; set; }
    [Required, RegularExpression("^[a-z0-9-]{2,80}$")] public string Slug { get; set; } = "";
    [Required, StringLength(200, MinimumLength = 2)] public string Title { get; set; } = "";
    [Required, RegularExpression("^(heater|part)$")] public string Category { get; set; } = "heater";
    [Range(1, 2000)] public int? Volume { get; set; }
    [StringLength(200)] public string Brand { get; set; } = "";
    [StringLength(200)] public string Model { get; set; } = "";
    [StringLength(6000)] public string Description { get; set; } = "";
    [Range(typeof(decimal), "0", "1000000000")] public decimal? Price { get; set; }
    [StringLength(200)] public string Availability { get; set; } = "";
    public Dictionary<string, string> Specs { get; set; } = [];
    public string Image { get; set; } = "/images/hero.webp";
    public List<string> Images { get; set; } = [];
    [StringLength(1000)] public string Keywords { get; set; } = "";
    [JsonIgnore] public IEnumerable<string> Gallery => new[] { Image }.Concat(Images).Distinct();
    public bool PriceIsEstimate { get; set; }
    [StringLength(500)] public string SourceUrl { get; set; } = "";
    public bool Demo { get; set; }
}

public sealed class SiteSettings
{
    [StringLength(50)] public string Phone { get; set; } = "";
    [StringLength(200)] public string Email { get; set; } = "";
    [StringLength(500)] public string Address { get; set; } = "";
    [StringLength(300)] public string Hours { get; set; } = "";
    [StringLength(5000)] public string Warranty { get; set; } = "";
    [StringLength(3000)] public string Delivery { get; set; } = "";
    public Dictionary<string, string> ServicePrices { get; set; } = [];
    public bool ShowDraftBanner { get; set; } = false;
}

public sealed record ServiceInfo(string Id, string Title, string Desc);
public sealed record ArticleInfo(string Slug, string Title, string Intro, List<string[]> Sections);
public sealed record RequestSpec(string Kind, string? Subject = null, string? Details = null);

public sealed class Lead
{
    [Key, MaxLength(36)] public string Id { get; set; } = "";
    [MaxLength(20)] public string Kind { get; set; } = "";
    [MaxLength(100)] public string Name { get; set; } = "";
    [MaxLength(30)] public string Phone { get; set; } = "";
    [MaxLength(200)] public string Email { get; set; } = "";
    [MaxLength(3000)] public string Message { get; set; } = "";
    public string Details { get; set; } = "{}";
    [MaxLength(200)] public string? Attachment { get; set; }
    [MaxLength(20)] public string Status { get; set; } = "new";
    [JsonPropertyName("created_at")] public long CreatedAt { get; set; }
    [JsonIgnore, MaxLength(64)] public string PayloadHash { get; set; } = "";
}

public sealed class ProductRecord
{
    [Key, MaxLength(80)] public string Slug { get; set; } = "";
    public string Data { get; set; } = "{}";
    public long UpdatedAt { get; set; }
}
public sealed class SettingRecord
{
    [Key] public string Key { get; set; } = "site";
    public string Value { get; set; } = "{}";
}
