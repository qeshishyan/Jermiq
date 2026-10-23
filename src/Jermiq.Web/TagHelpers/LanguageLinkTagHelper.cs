using Jermiq.Web.Services;
using Microsoft.AspNetCore.Html;
using Microsoft.AspNetCore.Razor.TagHelpers;
using System.Net;
using System.Text.Encodings.Web;
namespace Jermiq.Web.TagHelpers;
[HtmlTargetElement("a", Attributes = "href")]
public sealed class LanguageLinkTagHelper(ContentLocalizer localizer) : TagHelper
{
    public override void Process(TagHelperContext context, TagHelperOutput output)
    {
        var value = output.Attributes["href"].Value;
        string path;
        if (value is IHtmlContent content)
        {
            using var writer = new StringWriter();
            content.WriteTo(writer, HtmlEncoder.Default);
            // Razor has already encoded this attribute. Decode once before URL
            // parsing; SetAttribute will encode the final URL exactly once.
            path = WebUtility.HtmlDecode(writer.ToString());
        }
        else path = value?.ToString() ?? "";
        if (path.StartsWith('/') && !path.StartsWith("//") && !path.StartsWith("/api/"))
            output.Attributes.SetAttribute("href", path.Contains("lang=") ? path : localizer.Link(path));
    }
}
