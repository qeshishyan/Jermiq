using System.Text.Json;
using Jermiq.Web.Models;
namespace Jermiq.Web.Services;
public static class LeadPhotos
{
    public static string? Label(Lead lead)
    {
        using var doc = JsonDocument.Parse(lead.Details);
        return doc.RootElement.TryGetProperty("labelAttachment", out var path) ? path.GetString() : null;
    }
}
