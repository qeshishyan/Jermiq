using Jermiq.Web.Services;
using Microsoft.AspNetCore.Razor.TagHelpers;
namespace Jermiq.Web.TagHelpers;
[HtmlTargetElement("a", Attributes = "href")]
public sealed class LanguageLinkTagHelper(ContentLocalizer localizer) : TagHelper
{
    public override void Process(TagHelperContext context, TagHelperOutput output)
    {
        var path = output.Attributes["href"].Value?.ToString() ?? "";
        if (path.StartsWith('/') && !path.StartsWith("//") && !path.StartsWith("/api/"))
            output.Attributes.SetAttribute("href", path.Contains("lang=") ? path : localizer.Link(path));
    }
}
