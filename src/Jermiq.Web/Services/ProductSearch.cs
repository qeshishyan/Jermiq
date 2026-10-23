using System.Text;
using System.Text.RegularExpressions;
using Jermiq.Web.Models;
namespace Jermiq.Web.Services;
public static class ProductSearch
{
    public static string Normalize(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormKC).ToLowerInvariant().Replace("և", "եւ"), @"[^\p{L}\p{N}]+", " ").Trim();
    public static bool Matches(Product p, string query)
    {
        var haystack = Normalize(string.Join(' ', new[] { p.Title, p.Description, p.Brand, p.Model, p.Slug, p.Keywords, p.Sku, p.Manufacturer, p.Volume?.ToString() ?? "" }.Concat(p.ReplacementCodes).Concat(p.Specs.Keys).Concat(p.Specs.Values)));
        return Normalize(query).Split(' ', StringSplitOptions.RemoveEmptyEntries).All(word => haystack.Contains(word, StringComparison.Ordinal));
    }
}
