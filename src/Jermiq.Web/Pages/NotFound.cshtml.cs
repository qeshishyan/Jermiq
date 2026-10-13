using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc.RazorPages;
namespace Jermiq.Web.Pages;
public sealed class NotFoundModel(ContentLocalizer localizer) : PageModel
{
    public void OnGet()
    {
        Response.StatusCode = 404;
        ViewData["Title"] = localizer["Էջը չի գտնվել | Ջերմիք"];
        ViewData["NoIndex"] = true;
    }
}
