using Jermiq.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Admin;

[Authorize(Policy = "Admin")]
public sealed class ReviewsModel(ContentLocalizer localizer) : PageModel
{
    public void OnGet()
    {
        ViewData["Title"] = localizer["Կարծիքների կառավարում"] + " | TERMOMASTER";
        ViewData["NoIndex"] = true;
    }
}
