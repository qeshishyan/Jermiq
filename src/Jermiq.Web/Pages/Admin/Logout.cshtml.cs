using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
namespace Jermiq.Web.Pages.Admin;
public sealed class LogoutModel(SignInManager<IdentityUser> signIn) : PageModel
{
    public IActionResult OnGet() => Redirect("/admin");
    public async Task<IActionResult> OnPostAsync() { await signIn.SignOutAsync(); return LocalRedirect("/"); }
}
