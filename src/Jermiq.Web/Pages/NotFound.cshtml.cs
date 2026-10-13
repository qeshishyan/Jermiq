using Microsoft.AspNetCore.Mvc.RazorPages;
namespace Jermiq.Web.Pages;
public sealed class NotFoundModel : PageModel
{
    public void OnGet()
    {
        Response.StatusCode = 404;
        ViewData["Title"] = "Էջը չի գտնվել | Ջերմիք";
        ViewData["NoIndex"] = true;
    }
}
