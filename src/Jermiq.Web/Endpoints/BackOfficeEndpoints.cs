using System.ComponentModel.DataAnnotations;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Jermiq.Web.Data;
using Jermiq.Web.Models;
using Jermiq.Web.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Jermiq.Web.Endpoints;

public static class BackOfficeEndpoints
{
    public static readonly string[] Statuses = ["new", "contacted", "in_progress", "waiting", "completed", "cancelled"];
    private static readonly string[] Sources = ["website", "phone", "office", "email", "other"];
    private static readonly string[] Priorities = ["low", "normal", "high", "urgent"];
    public static void MapBackOfficeApi(this WebApplication app)
    {
        app.MapGet("/api/admin/arrivals", async (long? after, AppDbContext db, CancellationToken ct) =>
        {
            if (after is null)
                return Results.Json(new { cursor = await db.LeadArrivals.MaxAsync(x => (long?)x.Id, ct) ?? 0, ids = Array.Empty<string>(), more = false });
            if (after < 0) return Error("Invalid arrival cursor.");
            var events = await db.LeadArrivals.AsNoTracking().Where(x => x.Id > after).OrderBy(x => x.Id).Take(200).ToListAsync(ct);
            return Results.Json(new { cursor = events.LastOrDefault()?.Id ?? after.Value, ids = events.Select(x => x.LeadId), more = events.Count == 200 });
        }).RequireAuthorization("BackOffice");
        app.MapGet("/api/admin/leads", async (HttpContext ctx, AppDbContext db, UserManager<IdentityUser> users, CancellationToken ct) =>
        {
            var query = Filter(db, ctx);
            var page = int.TryParse(ctx.Request.Query["page"], out var n) ? Math.Max(1, n) : 1;
            const int pageSize = 25;
            var total = await query.CountAsync(ct);
            page = Math.Min(page, Math.Max(1, (total + pageSize - 1) / pageSize));
            var leads = await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
            var keys = leads.Select(x => "office:" + x.Id).ToArray();
            var rows = await db.Settings.AsNoTracking().Where(x => keys.Contains(x.Key)).ToDictionaryAsync(x => x.Key, ct);
            var staff = await users.GetUsersInRoleAsync("Office");
            var admins = await users.GetUsersInRoleAsync("Admin");
            return Results.Json(new { leads = leads.Select(x => new { lead = x, office = Office(x, rows.GetValueOrDefault("office:" + x.Id)) }),
                total, page, pageSize, stats = await db.Leads.GroupBy(x => x.Status).Select(x => new { status = x.Key, count = x.Count() }).ToListAsync(ct),
                kinds = await db.Leads.Select(x => x.Kind).Distinct().OrderBy(x => x).ToListAsync(ct),
                staff = staff.Concat(admins).DistinctBy(x => x.Id).Where(x => !x.LockoutEnd.HasValue || x.LockoutEnd <= DateTimeOffset.UtcNow).Select(x => new { id = x.Id, name = x.Email }) });
        }).RequireAuthorization("BackOffice");
        app.MapGet("/api/admin/lead/{id}", async (string id, AppDbContext db, CancellationToken ct) =>
        {
            var lead = await db.Leads.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (lead is null) return Error("Հայտը չի գտնվել։", 404);
            var row = await db.Settings.AsNoTracking().SingleOrDefaultAsync(x => x.Key == "office:" + id, ct);
            return Results.Json(new { lead, office = Office(lead, row) });
        }).RequireAuthorization("BackOffice");
        app.MapPost("/api/admin/lead", SaveLeadAsync).RequireAuthorization("BackOffice");
        app.MapPost("/api/admin/lead-attachment", async (HttpContext ctx, IAntiforgery anti, AppDbContext db, FileStorage storage, CancellationToken ct) =>
        {
            await anti.ValidateRequestAsync(ctx);
            if (!ctx.Request.HasFormContentType) return Error("Ընտրեք լուսանկարը։");
            var form = await ctx.Request.ReadFormAsync(ct);
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var lead = await db.Leads.SingleOrDefaultAsync(x => x.Id == form["id"].ToString(), ct);
            if (lead is null) return Error("Հայտը չի գտնվել։", 404);
            var row = await db.Settings.SingleOrDefaultAsync(x => x.Key == "office:" + lead.Id, ct);
            var office = Office(lead, row);
            if (!long.TryParse(form["revision"], out var revision) || revision != office.Revision) return Conflict();
            var file = form.Files.GetFile("attachment");
            if (file is null) return Error("Ընտրեք լուսանկարը։");
            string path;
            try { path = await storage.SaveAsync("leads", Guid.NewGuid().ToString(), await FileStorage.ValidateImageAsync(file, ct), ct); }
            catch (ArgumentException e) { return Error(e.Message); }
            var previous = lead.Attachment;
            lead.Attachment = path;
            Record(office, ctx, "Կցվել է լուսանկար");
            StoreOffice(db, lead.Id, row, office);
            try { await db.SaveChangesAsync(ct); }
            catch { storage.Delete(path); throw; }
            await transaction.CommitAsync(ct);
            storage.Delete(previous);
            return Results.Json(new { ok = true, revision = office.Revision });
        }).RequireAuthorization("BackOffice");
        app.MapGet("/api/admin/export", async (HttpContext ctx, AppDbContext db, CancellationToken ct) =>
        {
            var leads = await Filter(db, ctx).OrderByDescending(x => x.CreatedAt).Take(10000).ToListAsync(ct);
            static string Cell(string value)
            {
                // Spreadsheet programs must not interpret client data as formulas.
                if (value.TrimStart().StartsWith('=') || value.TrimStart().StartsWith('+') || value.TrimStart().StartsWith('-') || value.TrimStart().StartsWith('@')) value = "'" + value;
                return "\"" + value.Replace("\"", "\"\"") + "\"";
            }
            var csv = new StringBuilder("\uFEFFID,Type,Name,Phone,Email,Status,Created,Message\r\n");
            foreach (var l in leads) csv.AppendLine(string.Join(',', new[] { l.Id, l.Kind, l.Name, l.Phone, l.Email, l.Status, DateTimeOffset.FromUnixTimeMilliseconds(l.CreatedAt).ToString("O"), l.Message }.Select(Cell)));
            return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", "jermiq-requests.csv");
        }).RequireAuthorization("BackOffice");
        app.MapGet("/api/admin/cms", async (AppDbContext db, ContentLocalizer l, CatalogService catalog, CancellationToken ct) =>
        {
            // Include newly entered product/contact phrases so they can be translated from CMS.
            foreach (var p in await catalog.GetProductsAsync(ct, false))
                foreach (var text in new[] { p.Title, p.Description, p.Availability }) AddText(l.Content, text);
            var s = await catalog.GetSettingsAsync(ct, false);
            foreach (var text in new[] { s.Address, s.Hours, s.Warranty, s.Delivery }.Concat(s.ServicePrices.Values)) AddText(l.Content, text);
            foreach (var text in l.Content.Services.SelectMany(s => new[] { s.Title, s.Desc }).Concat(l.Content.Articles.SelectMany(a => new[] { a.Title, a.Intro }.Concat(a.Sections.SelectMany(s => s))))) AddText(l.Content, text);
            return Results.Json(l.Content);
        }).RequireAuthorization("Admin");
        app.MapPost("/api/admin/cms", SaveCmsAsync).RequireAuthorization("Admin");
        app.MapGet("/api/admin/users", async (UserManager<IdentityUser> users) =>
        {
            var list = await users.Users.OrderBy(x => x.Email).ToListAsync();
            var result = new List<object>();
            foreach (var u in list) result.Add(new { id = u.Id, email = u.Email, role = (await users.GetRolesAsync(u)).Contains("Admin") ? "Admin" : "Office", disabled = u.LockoutEnd > DateTimeOffset.UtcNow });
            return Results.Json(new { users = result });
        }).RequireAuthorization("Admin");
        app.MapPost("/api/admin/users", SaveUserAsync).RequireAuthorization("Admin");
    }
    private static IQueryable<Lead> Filter(AppDbContext db, HttpContext ctx)
    {
        var query = db.Leads.AsNoTracking();
        var search = ctx.Request.Query["q"].ToString().Trim().ToLowerInvariant();
        if (search.Length > 200) search = search[..200];
        if (search.Length > 0) query = query.Where(x => x.Name.ToLower().Contains(search) || x.Phone.Contains(search) || x.Email.ToLower().Contains(search) || x.Message.ToLower().Contains(search) || x.Id.Contains(search) || x.Details.ToLower().Contains(search));
        var status = ctx.Request.Query["status"].ToString();
        var kind = ctx.Request.Query["kind"].ToString();
        if (status.Length > 0 && status != "all") query = query.Where(x => x.Status == status);
        if (kind.Length > 0 && kind != "all") query = query.Where(x => x.Kind == kind);
        return query;
    }
    private static async Task<IResult> SaveLeadAsync(HttpContext ctx, IAntiforgery anti, AppDbContext db, UserManager<IdentityUser> users, CancellationToken ct)
    {
        await anti.ValidateRequestAsync(ctx);
        LeadEdit? edit;
        try { edit = await ctx.Request.ReadFromJsonAsync<LeadEdit>(ct); }
        catch (JsonException) { return Error("Հարցման ձևաչափը սխալ է։"); }
        if (edit is not null) edit.Email = string.IsNullOrWhiteSpace(edit.Email) ? null : edit.Email.Trim();
        if (edit is null || new[] { edit.Kind, edit.Name, edit.Phone, edit.Message, edit.Subject, edit.Brand, edit.Model, edit.Selection, edit.Address, edit.Note, edit.Source, edit.Priority, edit.Status, edit.Assignee }.Any(x => x is null) || !Valid(edit) || !Guid.TryParseExact(edit.Id, "D", out var guid) ||
            !Regex.IsMatch(edit.Kind, "^[\\p{L}\\p{N} _-]{2,20}$") || string.IsNullOrWhiteSpace(edit.Name) || edit.Name.Trim().Length < 2 ||
            !Statuses.Contains(edit.Status) || !Sources.Contains(edit.Source) || !Priorities.Contains(edit.Priority) ||
            (edit.Phone.Length > 0 && (!Regex.IsMatch(edit.Phone, "^[+0-9 ()-]{7,30}$") || edit.Phone.Count(char.IsAsciiDigit) < 7)))
            return Error("Ստուգեք հայտի լրացված տվյալները։");
        if (edit.Assignee.Length > 0)
        {
            var user = await users.FindByIdAsync(edit.Assignee);
            if (user is null || user.LockoutEnd > DateTimeOffset.UtcNow || !(await users.IsInRoleAsync(user, "Office") || await users.IsInRoleAsync(user, "Admin"))) return Error("Ընտրեք գործող պատասխանատու։");
        }
        // Serialize concurrent edits through SQLite's write transaction before reading the revision.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var id = guid.ToString();
        var lead = await db.Leads.SingleOrDefaultAsync(x => x.Id == id, ct);
        var row = await db.Settings.SingleOrDefaultAsync(x => x.Key == "office:" + id, ct);
        var created = lead is null;
        var office = created ? new OfficeLead() : Office(lead!, row);
        if (edit.Revision != office.Revision) return Conflict();
        if (created) db.Leads.Add(lead = new Lead { Id = id, CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        var before = new Dictionary<string, string>
        {
            ["Name"] = lead!.Name, ["Phone"] = lead.Phone, ["Email"] = lead.Email, ["Request type"] = lead.Kind,
            ["Status"] = lead.Status, ["Priority"] = office.Priority, ["Assignee"] = office.Assignee,
            ["Address"] = office.Address, ["Subject"] = office.Subject, ["Model"] = office.Model,
            ["Manufacturer"] = office.Brand, ["Customer message"] = lead.Message, ["Order / technical details"] = office.Selection,
            ["Channel"] = office.Source, ["Due date"] = office.DueAt?.ToString("O") ?? ""
        };
        if (created) db.LeadArrivals.Add(new LeadArrival { LeadId = id });
        var action = created ? "Հայտը ստեղծվել է օֆիսից" : "Request edited";
        lead!.Kind = edit.Kind.Trim(); lead.Name = edit.Name.Trim(); lead.Phone = edit.Phone.Trim(); lead.Email = edit.Email?.Trim() ?? "";
        lead.Message = edit.Message.Trim(); lead.Status = edit.Status;
        lead.Details = SiteJson.Serialize(new { subject = edit.Subject.Trim(), brand = edit.Brand.Trim(), model = edit.Model.Trim(), selection = edit.Selection.Trim() });
        office.Source = edit.Source; office.Priority = edit.Priority; office.Assignee = edit.Assignee;
        office.Address = edit.Address.Trim(); office.Subject = edit.Subject.Trim(); office.Brand = edit.Brand.Trim(); office.Model = edit.Model.Trim(); office.Selection = edit.Selection.Trim(); office.DueAt = edit.DueAt;
        if (!string.IsNullOrWhiteSpace(edit.Note)) office.Notes.Add(new OfficeNote(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ctx.User.Identity?.Name ?? "", edit.Note.Trim()));
        var after = new Dictionary<string, string>
        {
            ["Name"] = lead.Name, ["Phone"] = lead.Phone, ["Email"] = lead.Email, ["Request type"] = lead.Kind,
            ["Status"] = lead.Status, ["Priority"] = office.Priority, ["Assignee"] = office.Assignee,
            ["Address"] = office.Address, ["Subject"] = office.Subject, ["Model"] = office.Model,
            ["Manufacturer"] = office.Brand, ["Customer message"] = lead.Message, ["Order / technical details"] = office.Selection,
            ["Channel"] = office.Source, ["Due date"] = office.DueAt?.ToString("O") ?? ""
        };
        Record(office, ctx, action, created ? null : after.Where(x => x.Value != before[x.Key]).ToDictionary(x => x.Key, x => before[x.Key] + " → " + x.Value));
        StoreOffice(db, id, row, office);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Json(new { id, revision = office.Revision }, statusCode: created ? 201 : 200);
    }
    public static OfficeLead Office(Lead lead, SettingRecord? row)
    {
        if (row is not null) return SiteJson.Deserialize<OfficeLead>(row.Value);
        var result = new OfficeLead();
        try
        {
            var details = SiteJson.Deserialize<Dictionary<string, string>>(lead.Details);
            result.Subject = details.GetValueOrDefault("subject") ?? ""; result.Brand = details.GetValueOrDefault("brand") ?? "";
            result.Model = details.GetValueOrDefault("model") ?? ""; result.Selection = details.GetValueOrDefault("selection") ?? "";
        }
        catch (JsonException) { }
        return result;
    }
    public static void Record(OfficeLead office, HttpContext ctx, string action, Dictionary<string, string>? changes = null)
    {
        office.Revision++;
        office.History.Add(new OfficeEvent(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ctx.User.Identity?.Name ?? "", action, changes));
    }
    public static void StoreOffice(AppDbContext db, string id, SettingRecord? row, OfficeLead office)
    {
        if (row is null) db.Settings.Add(row = new SettingRecord { Key = "office:" + id });
        row.Value = SiteJson.Serialize(office);
    }
    private static void AddText(CmsContent cms, string text)
    {
        if (!string.IsNullOrWhiteSpace(text)) cms.Texts.TryAdd(text, new Dictionary<string, string> { ["hy"] = text, ["en"] = "", ["ru"] = "" });
    }
    private sealed class CmsEdit
    {
        public long Revision { get; set; }
        public Dictionary<string, Dictionary<string, string>>? Texts { get; set; }
        public List<ServiceInfo>? Services { get; set; }
        public List<ArticleInfo>? Articles { get; set; }
    }
    private static async Task<IResult> SaveCmsAsync(HttpContext ctx, IAntiforgery anti, AppDbContext db, ContentLocalizer l, CancellationToken ct)
    {
        await anti.ValidateRequestAsync(ctx);
        CmsEdit? edit;
        try { edit = await ctx.Request.ReadFromJsonAsync<CmsEdit>(ct); }
        catch (JsonException) { return Error("Հարցման ձևաչափը սխալ է։"); }
        if (edit is null || edit.Texts?.Count > 3000 || edit.Texts?.Any(x => x.Key.Length is < 1 or > 10000 || x.Value is null || x.Value.Count > 3 || x.Value.Any(t => !ContentLocalizer.Languages.Contains(t.Key) || t.Value is null || t.Value.Length > 10000)) == true)
            return Error("Ստուգեք թարգմանությունների տվյալները։");
        if (edit.Services is not null && (edit.Services.Count > 50 || edit.Services.Any(x => x is null || !Regex.IsMatch(x.Id ?? "", "^[a-z0-9-]{2,80}$") || string.IsNullOrWhiteSpace(x.Title) || x.Title.Length > 200 || x.Desc is null || x.Desc.Length > 6000) || edit.Services.Select(x => x.Id).Distinct().Count() != edit.Services.Count)) return Error("Ստուգեք ծառայությունները։");
        if (edit.Articles is not null && (edit.Articles.Count > 100 || edit.Articles.Any(x => x is null || !Regex.IsMatch(x.Slug ?? "", "^[a-z0-9-]{2,80}$") || string.IsNullOrWhiteSpace(x.Title) || x.Title.Length > 200 || x.Intro is null || x.Intro.Length > 6000 || x.Sections is null || x.Sections.Count > 50 || x.Sections.Any(s => s is null || s.Length != 2 || s.Any(v => v is null || v.Length > 10000))) || edit.Articles.Select(x => x.Slug).Distinct().Count() != edit.Articles.Count)) return Error("Ստուգեք նյութերը։");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var row = await db.Settings.SingleOrDefaultAsync(x => x.Key == "cms", ct);
        var content = row is null ? l.Content : SiteJson.Deserialize<CmsContent>(row.Value);
        if (edit.Revision != content.Revision) return Conflict();
        if (edit.Texts is not null) foreach (var pair in edit.Texts) content.Texts[pair.Key] = pair.Value;
        if (edit.Services is not null) content.Services = edit.Services;
        if (edit.Articles is not null) content.Articles = edit.Articles;
        content.Revision++;
        if (row is null) db.Settings.Add(row = new SettingRecord { Key = "cms" });
        row.Value = SiteJson.Serialize(content);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Json(new { ok = true, revision = content.Revision });
    }
    private sealed class UserEdit
    {
        public string? Id { get; set; }
        public string Email { get; set; } = "";
        public string Password { get; set; } = "";
        public string Role { get; set; } = "Office";
        public bool Disabled { get; set; }
    }
    private static async Task<IResult> SaveUserAsync(HttpContext ctx, IAntiforgery anti, UserManager<IdentityUser> users, RoleManager<IdentityRole> roles, AppDbContext db, CancellationToken ct)
    {
        await anti.ValidateRequestAsync(ctx);
        UserEdit? edit;
        try { edit = await ctx.Request.ReadFromJsonAsync<UserEdit>(ct); }
        catch (JsonException) { return Error("Հարցման ձևաչափը սխալ է։"); }
        if (edit is null || edit.Email is null || edit.Password is null || edit.Email.Length > 200 || !new EmailAddressAttribute().IsValid(edit.Email) || edit.Password.Length > 200 || edit.Role is not ("Admin" or "Office")) return Error("Ստուգեք օգտատիրոջ տվյալները։");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var user = string.IsNullOrEmpty(edit.Id) ? null : await users.FindByIdAsync(edit.Id);
        if (!string.IsNullOrEmpty(edit.Id) && user is null) return Error("Օգտատերը չի գտնվել։", 404);
        if (user?.Id == users.GetUserId(ctx.User) && (edit.Disabled || edit.Role != "Admin")) return Error("Չեք կարող անջատել ձեր սեփական ադմինիստրատորի հասանելիությունը։");
        if (user is not null && await users.IsInRoleAsync(user, "Admin") && (edit.Disabled || edit.Role != "Admin") && (await users.GetUsersInRoleAsync("Admin")).Count(x => x.LockoutEnd is null || x.LockoutEnd <= DateTimeOffset.UtcNow) <= 1)
            return Error("Պետք է մնա առնվազն մեկ գործող ադմինիստրատոր։");
        var accessChanged = user is not null && ((await users.IsInRoleAsync(user, "Admin") ? "Admin" : "Office") != edit.Role || (user.LockoutEnd > DateTimeOffset.UtcNow) != edit.Disabled || edit.Password.Length > 0);
        IdentityResult result;
        if (user is null)
        {
            user = new IdentityUser { UserName = edit.Email, Email = edit.Email, EmailConfirmed = true, LockoutEnabled = true };
            result = await users.CreateAsync(user, edit.Password);
            if (!result.Succeeded) return Error(string.Join("; ", result.Errors.Select(x => x.Description)));
        }
        else
        {
            if (!string.Equals(user.Email, edit.Email, StringComparison.OrdinalIgnoreCase)) return Error("Գործող օգտատիրոջ էլ․ փոստը չի փոխվում։");
            if (edit.Password.Length > 0)
            {
                result = await users.ResetPasswordAsync(user, await users.GeneratePasswordResetTokenAsync(user), edit.Password);
                if (!result.Succeeded) return Error(string.Join("; ", result.Errors.Select(x => x.Description)));
            }
        }
        if (!await roles.RoleExistsAsync(edit.Role))
        {
            result = await roles.CreateAsync(new IdentityRole(edit.Role));
            if (!result.Succeeded) return Error("Չհաջողվեց ստեղծել դերը։");
        }
        result = await users.AddToRoleAsync(user, edit.Role);
        if (!result.Succeeded && !await users.IsInRoleAsync(user, edit.Role)) return Error("Չհաջողվեց նշանակել դերը։");
        var other = (await users.GetRolesAsync(user)).Where(x => x != edit.Role).ToArray();
        if (other.Length > 0)
        {
            result = await users.RemoveFromRolesAsync(user, other);
            if (!result.Succeeded) return Error("Չհաջողվեց փոխել դերը։");
        }
        await users.SetLockoutEnabledAsync(user, true);
        result = await users.SetLockoutEndDateAsync(user, edit.Disabled ? DateTimeOffset.UtcNow.AddYears(100) : null);
        if (!result.Succeeded) return Error("Չհաջողվեց փոխել հասանելիությունը։");
        if (accessChanged) await users.UpdateSecurityStampAsync(user);
        await transaction.CommitAsync(ct);
        return Results.Json(new { ok = true });
    }
    private static bool Valid(object model) => Validator.TryValidateObject(model, new ValidationContext(model), [], true);
    private static IResult Error(string message, int status = 400) => new LocalizedError(message, status);
    private static IResult Conflict() => Error("Տվյալները փոխվել են այլ աշխատակցի կողմից։ Թարմացրեք և կրկին բացեք գրառումը։", 409);
}
