using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Admin;

public sealed class LoginModel(SignInManager<IdentityUser> signIn, UserManager<IdentityUser> users) : PageModel
{
    [BindProperty, Required, EmailAddress] public string Email { get; set; } = "";
    [BindProperty, Required] public string Password { get; set; } = "";
    [BindProperty] public string ReturnUrl { get; set; } = "/admin";
    public string? ErrorMessage { get; private set; }
    public void OnGet(string? returnUrl)
    {
        ReturnUrl = Url.IsLocalUrl(returnUrl) ? returnUrl! : "/admin";
        SetMetadata();
    }
    public async Task<IActionResult> OnPostAsync()
    {
        SetMetadata();
        if (!ModelState.IsValid) { ErrorMessage = "Լրացրեք էլ․ փոստը և գաղտնաբառը։"; return Page(); }
        var user = await users.FindByEmailAsync(Email.Trim());
        if (user is null || !await users.IsInRoleAsync(user, "Admin"))
        { ErrorMessage = "Մուտքի տվյալները սխալ են։"; return Page(); }
        var result = await signIn.PasswordSignInAsync(user, Password, false, lockoutOnFailure: true);
        if (!result.Succeeded)
        { ErrorMessage = result.IsLockedOut ? "Մուտքը ժամանակավորապես սահմանափակվել է։ Փորձեք 15 րոպեից։" : "Մուտքի տվյալները սխալ են։"; return Page(); }
        return LocalRedirect(Url.IsLocalUrl(ReturnUrl) ? ReturnUrl : "/admin");
    }
    private void SetMetadata()
    {
        ViewData["Title"] = "Կառավարման մուտք | Ջերմիք";
        ViewData["NoIndex"] = true;
        ViewData["Canonical"] = "/admin/login";
    }
}
