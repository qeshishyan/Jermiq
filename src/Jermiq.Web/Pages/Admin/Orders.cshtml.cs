using Jermiq.Web.Services;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Admin;

public sealed class OrdersModel(ContentLocalizer localizer) : PageModel
{
    public void OnGet()
    {
        ViewData["Title"] = localizer["Պատվերների կառավարում"] + " | TERMOMASTER";
        ViewData["NoIndex"] = true;
        ViewData["Canonical"] = "/admin/orders";
    }
}
