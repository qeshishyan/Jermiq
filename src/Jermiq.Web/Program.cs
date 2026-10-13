using Microsoft.AspNetCore.Authentication;
using System.Net;
using System.Threading.RateLimiting;
using Jermiq.Web.Data;
using Jermiq.Web.Endpoints;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var paths = new DataPaths(builder.Configuration, builder.Environment);
builder.Services.AddSingleton(paths);
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite($"Data Source={paths.Database};Default Timeout=30"));
builder.Services.AddIdentity<IdentityUser, IdentityRole>(o =>
{
    o.User.RequireUniqueEmail = true;
    o.Password.RequiredLength = 12;
    o.Lockout.MaxFailedAccessAttempts = 5;
    o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
}).AddEntityFrameworkStores<AppDbContext>().AddDefaultTokenProviders();
var requireHttps = builder.Configuration.GetValue<bool>("Security:RequireHttps");
builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "Jermiq.Admin";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = requireHttps ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    o.LoginPath = "/admin/login";
    o.AccessDeniedPath = "/admin/login";
    o.ExpireTimeSpan = TimeSpan.FromHours(8);
    o.SlidingExpiration = true;
    o.Events.OnValidatePrincipal = async context =>
    {
        await SecurityStampValidator.ValidatePrincipalAsync(context);
        if (context.Principal?.Identity?.IsAuthenticated != true) return;
        var users = context.HttpContext.RequestServices.GetRequiredService<UserManager<IdentityUser>>();
        var user = await users.GetUserAsync(context.Principal);
        var stampClaim = context.HttpContext.RequestServices.GetRequiredService<Microsoft.Extensions.Options.IOptions<IdentityOptions>>().Value.ClaimsIdentity.SecurityStampClaimType;
        if (user is null || user.LockoutEnd > DateTimeOffset.UtcNow ||
            await users.GetSecurityStampAsync(user) != context.Principal.FindFirst(stampClaim)?.Value)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
        }
    };
    o.Events.OnRedirectToLogin = ctx => ApiRedirect(ctx, 401);
    o.Events.OnRedirectToAccessDenied = ctx => ApiRedirect(ctx, 403);
});
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy("Admin", policy => policy.RequireAuthenticatedUser().RequireRole("Admin"));
    o.AddPolicy("BackOffice", policy => policy.RequireAuthenticatedUser().RequireRole("Admin", "Office"));
});
builder.Services.AddRazorPages(o =>
{
    o.Conventions.AuthorizeFolder("/Admin", "BackOffice");
    o.Conventions.AllowAnonymousToPage("/Admin/Login");
});
builder.Services.AddAntiforgery(o => o.HeaderName = "X-CSRF-TOKEN");
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(paths.Keys)).SetApplicationName("Jermiq");
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 6 * 1024 * 1024);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 6 * 1024 * 1024);
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    foreach (var proxy in builder.Configuration.GetSection("Security:TrustedProxies").Get<string[]>() ?? [])
        o.KnownProxies.Add(IPAddress.Parse(proxy));
});
builder.Services.AddScoped<CatalogService>();
builder.Services.AddSingleton<CmsDefaults>();
builder.Services.AddScoped<ContentLocalizer>();
builder.Services.AddScoped<StaticContent>();
builder.Services.AddSingleton<FileStorage>();
builder.Services.AddScoped<SeoService>();
builder.Services.AddRateLimiter(o =>
{
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
    {
        var sensitive = HttpMethods.IsPost(ctx.Request.Method) &&
            (ctx.Request.Path == "/api/leads" || ctx.Request.Path == "/admin/login");
        if (!sensitive) return RateLimitPartition.GetNoLimiter("unlimited");
        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter($"{ctx.Request.Path}:{ip}", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = ctx.Request.Path == "/api/leads" ? 30 : 10,
            Window = TimeSpan.FromMinutes(15), QueueLimit = 0, AutoReplenishment = true
        });
    });
    o.RejectionStatusCode = 429;
    o.OnRejected = async (context, ct) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "900";
        await context.HttpContext.Response.WriteAsJsonAsync(new { error = context.HttpContext.RequestServices.GetRequiredService<ContentLocalizer>()["Հարցումները շատ են։ Փորձեք կրկին ավելի ուշ։"] }, ct);
    };
});

var app = builder.Build();
await DatabaseInitializer.InitializeAsync(app.Services, app.Environment,
    app.Configuration.GetValue("Persistence:ApplyMigrationsOnStartup", true));

// Explicit, local administrator creation. No public claim endpoint or seeded password.
if (args.Contains("--create-admin"))
{
    var email = Environment.GetEnvironmentVariable("JERMIQ_ADMIN_EMAIL");
    var password = Environment.GetEnvironmentVariable("JERMIQ_ADMIN_PASSWORD");
    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        throw new InvalidOperationException("Set JERMIQ_ADMIN_EMAIL and JERMIQ_ADMIN_PASSWORD before --create-admin.");
    await using var scope = app.Services.CreateAsyncScope();
    var users = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();
    var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    if (await users.FindByEmailAsync(email) is not null)
        throw new InvalidOperationException("Administrator already exists; its password has not been changed.");
    if (!await roles.RoleExistsAsync("Admin"))
    {
        var result = await roles.CreateAsync(new IdentityRole("Admin"));
        if (!result.Succeeded) throw new InvalidOperationException(string.Join("; ", result.Errors.Select(x => x.Description)));
    }
    var user = new IdentityUser { UserName = email, Email = email, EmailConfirmed = true };
    var created = await users.CreateAsync(user, password);
    if (!created.Succeeded) throw new InvalidOperationException(string.Join("; ", created.Errors.Select(x => x.Description)));
    var granted = await users.AddToRoleAsync(user, "Admin");
    if (!granted.Succeeded) throw new InvalidOperationException("Could not grant the administrator role.");
    Console.WriteLine("Administrator created. Credentials are not written to configuration files.");
    return;
}

app.UseForwardedHeaders();
if (requireHttps)
{
    if (!app.Environment.IsDevelopment()) app.UseHsts();
    app.UseHttpsRedirection();
}
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    ctx.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    if (ctx.Request.Path.StartsWithSegments("/admin") || ctx.Request.Path.StartsWithSegments("/api/admin") || ctx.Request.Path.StartsWithSegments("/api/attachments"))
    {
        ctx.Response.Headers.CacheControl = "private, no-store";
        ctx.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
    }
    try { await next(ctx); }
    catch (Exception e) when (!ctx.Response.HasStarted)
    {
        app.Logger.LogError(e, "Request failed for {Path}", ctx.Request.Path);
        ctx.Response.Clear();
        ctx.Response.StatusCode = e switch { AntiforgeryValidationException => 400, BadHttpRequestException b => b.StatusCode, _ => 503 };
        if (ctx.Request.Path.StartsWithSegments("/api"))
            await ctx.Response.WriteAsJsonAsync(new { error = ctx.RequestServices.GetRequiredService<ContentLocalizer>()["Չհաջողվեց մշակել հարցումը։ Թարմացրեք էջը և փորձեք կրկին։"] });
        else await ctx.Response.WriteAsync(ctx.RequestServices.GetRequiredService<ContentLocalizer>()["Հարցումը ժամանակավորապես չի մշակվել։ Փորձեք կրկին։"]);
    }
});
app.UseStatusCodePagesWithReExecute("/not-found");
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "public, max-age=86400"
});
app.Use(async (ctx, next) =>
{
    if (!ctx.Request.Path.StartsWithSegments("/css") && !ctx.Request.Path.StartsWithSegments("/js") && !ctx.Request.Path.StartsWithSegments("/images"))
    {
        await ctx.RequestServices.GetRequiredService<ContentLocalizer>().LoadAsync(ctx, ctx.RequestServices.GetRequiredService<AppDbContext>());
        ctx.Response.Headers.ContentLanguage = ctx.RequestServices.GetRequiredService<ContentLocalizer>().Language;
        ctx.Response.Headers.Vary = "Cookie";
    }
    await next(ctx);
});
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();
app.MapRazorPages();
app.MapJermiqApi();
app.MapBackOfficeApi();
app.MapSeoEndpoints();
app.MapGet("/health", () => Results.Json(new { status = "ok" }));
app.MapFallback("/api/{**path}", () => new LocalizedError("API հասցեն չի գտնվել։", 404));
app.Run();

static Task ApiRedirect(Microsoft.AspNetCore.Authentication.RedirectContext<Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationOptions> ctx, int status)
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.StatusCode = status;
        return ctx.Response.WriteAsJsonAsync(new { error = ctx.HttpContext.RequestServices.GetRequiredService<ContentLocalizer>()["Մուտքը սահմանափակված է։ Մուտք գործեք կառավարման բաժին։"] });
    }
    ctx.Response.Redirect(ctx.RedirectUri);
    return Task.CompletedTask;
}
