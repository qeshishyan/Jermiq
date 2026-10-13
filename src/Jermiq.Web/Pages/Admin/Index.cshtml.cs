using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc.RazorPages;
namespace Jermiq.Web.Pages.Admin;
public sealed class IndexModel(ContentLocalizer localizer) : PageModel
{
    public void OnGet()
    {
        ViewData["Title"] = localizer["Կառավարման բաժին | Ջերմիք"];
        ViewData["Canonical"] = "/admin";
        ViewData["NoIndex"] = true;
    }
}
