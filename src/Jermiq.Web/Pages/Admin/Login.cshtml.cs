using System.ComponentModel.DataAnnotations;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Jermiq.Web.Pages.Admin;

public sealed class LoginModel(SignInManager<IdentityUser> signIn, UserManager<IdentityUser> users, ContentLocalizer localizer) : PageModel
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
        if (!ModelState.IsValid) { ErrorMessage = localizer["Լրացրեք էլ․ փոստը և գաղտնաբառը։"]; return Page(); }
        var user = await users.FindByEmailAsync(Email.Trim());
        if (user is null || !(await users.IsInRoleAsync(user, "Admin") || await users.IsInRoleAsync(user, "Office")))
        { ErrorMessage = localizer["Մուտքի տվյալները սխալ են։"]; return Page(); }
        var result = await signIn.PasswordSignInAsync(user, Password, false, lockoutOnFailure: true);
        if (!result.Succeeded)
        { ErrorMessage = result.IsLockedOut ? localizer["Մուտքը ժամանակավորապես սահմանափակվել է։ Փորձեք 15 րոպեից։"] : localizer["Մուտքի տվյալները սխալ են։"]; return Page(); }
        return LocalRedirect(Url.IsLocalUrl(ReturnUrl) ? ReturnUrl : "/admin");
    }
    private void SetMetadata()
    {
        ViewData["Title"] = localizer["Կառավարման մուտք | Ջերմիք"];
        ViewData["NoIndex"] = true;
        ViewData["Canonical"] = "/admin/login";
    }
}
