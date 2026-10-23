using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Admin;

[Authorize(Policy = "Admin")]
public sealed class StoreModel : PageModel
{
    public void OnGet() => ViewData["NoIndex"] = true;
}
