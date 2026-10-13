using Microsoft.AspNetCore.Mvc.RazorPages;
namespace Jermiq.Web.Pages.Admin;
public sealed class IndexModel : PageModel
{
    public void OnGet()
    {
        ViewData["Title"] = "Կառավարման բաժին | Ջերմիք";
        ViewData["Canonical"] = "/admin";
        ViewData["NoIndex"] = true;
    }
}
