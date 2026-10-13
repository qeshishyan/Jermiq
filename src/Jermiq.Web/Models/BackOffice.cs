using System.ComponentModel.DataAnnotations;
namespace Jermiq.Web.Models;

public sealed class OfficeLead
{
    public long Revision { get; set; }
    public string Source { get; set; } = "website";
    public string Priority { get; set; } = "normal";
    public string Assignee { get; set; } = "";
    public string Address { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Brand { get; set; } = "";
    public string Model { get; set; } = "";
    public string Selection { get; set; } = "";
    public DateTimeOffset? DueAt { get; set; }
    public List<OfficeEvent> History { get; set; } = [];
    public List<OfficeNote> Notes { get; set; } = [];
}
public sealed record OfficeEvent(long At, string Actor, string Action, Dictionary<string, string>? Changes = null);
public sealed record OfficeNote(long At, string Actor, string Text);
public sealed class LeadEdit
{
    public string Id { get; set; } = "";
    public long Revision { get; set; }
    [Required, StringLength(20, MinimumLength = 2)] public string Kind { get; set; } = "service";
    [Required, StringLength(100, MinimumLength = 2)] public string Name { get; set; } = "";
    [StringLength(30)] public string Phone { get; set; } = "";
    [EmailAddress, StringLength(200)] public string? Email { get; set; }
    [StringLength(3000)] public string Message { get; set; } = "";
    [StringLength(200)] public string Subject { get; set; } = "";
    [StringLength(100)] public string Brand { get; set; } = "";
    [StringLength(100)] public string Model { get; set; } = "";
    [StringLength(6000)] public string Selection { get; set; } = "";
    [StringLength(500)] public string Address { get; set; } = "";
    [StringLength(3000)] public string Note { get; set; } = "";
    public string Source { get; set; } = "phone";
    public string Priority { get; set; } = "normal";
    public string Status { get; set; } = "new";
    [StringLength(200)] public string Assignee { get; set; } = "";
    public DateTimeOffset? DueAt { get; set; }
}
