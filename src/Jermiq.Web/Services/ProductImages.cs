using System.Text.RegularExpressions;
namespace Jermiq.Web.Services;
public static class ProductImages
{
    private static readonly HashSet<string> External = new(StringComparer.Ordinal)
    {
        "https://ariston.kleecks-cdn.com/imgix/pub/media/catalog/product/a/n/andris-lux-front_1_1.png?trim=auto&trimmd=0",
        "https://ariston.kleecks-cdn.com/imgix/pub/media/catalog/product/b/l/blu1r_1_.jpg?trim=auto&trimmd=0",
        "https://thermex.ru/upload/iblock/7da/ge803wuctiixzyk2agbe1a08srvlm84p.jpeg",
        "https://thermex.ru/upload/resize_cache/iblock/295/68_68_140cd750bba9870f18aada2478b24840a/ss3qjeagpdxwhn2pa1a6r55rhfhyjo8g.jpeg",
        "https://thermex.ru/upload/resize_cache/iblock/843/68_68_140cd750bba9870f18aada2478b24840a/122gz00xqyzhx0hcl48vk7r8wz329hpo.jpeg",
        "https://www.thermex.ru/upload/resize_cache/iblock/9ec/68_68_140cd750bba9870f18aada2478b24840a/u1t9ih96uddxiybxafnmjbfkbec229j6.jpeg",
    };
    public static bool IsExternal(string? path) => path is not null && External.Contains(path);
    public static bool IsAllowed(string? path) => IsExternal(path) || Regex.IsMatch(path ?? "", @"^/(images/(hero|parts)\.webp|api/product-image\?id=[a-f0-9-]{36})$");
}
