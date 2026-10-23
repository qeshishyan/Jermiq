using System.Text;
using System.Text.RegularExpressions;
using Jermiq.Web.Models;
namespace Jermiq.Web.Services;
public static class ProductSearch
{
    public static string Normalize(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormKC).ToLowerInvariant().Replace("և", "եւ"), @"[^\p{L}\p{N}]+", " ").Trim();
    public static bool Matches(Product p, string query)
    {
        var normalizedQuery = Normalize(query);
        var compactQuery = normalizedQuery.Replace(" ", "", StringComparison.Ordinal);
        var codes = new[] { p.Sku }.Concat(p.ReplacementCodes).Concat(p.Specs
            .Where(x => new[] { "կոդ", "code", "код", "артикул" }.Any(word => Normalize(x.Key).Contains(word, StringComparison.Ordinal)))
            .Select(x => x.Value));
        if (compactQuery.Length >= 2 && codes.Any(code => Normalize(code).Replace(" ", "", StringComparison.Ordinal).Contains(compactQuery, StringComparison.Ordinal))) return true;
        var haystack = Normalize(string.Join(' ', new[] { p.Title, p.Description, p.Brand, p.Model, p.Slug, p.Keywords, p.Sku, p.Manufacturer, p.Volume?.ToString() ?? "" }.Concat(p.ReplacementCodes).Concat(p.Specs.Keys).Concat(p.Specs.Values)));
        return normalizedQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries).All(word => haystack.Contains(word, StringComparison.Ordinal));
    }
}
