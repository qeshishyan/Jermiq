using System.Text.Json;
using System.Text.Json.Nodes;
using Jermiq.Web.Models;
namespace Jermiq.Web.Services;
public static class LeadPhotos
{
    public static string? Label(Lead lead)
    {
        try
        {
            using var doc = JsonDocument.Parse(lead.Details);
            return doc.RootElement.ValueKind == JsonValueKind.Object &&
                doc.RootElement.TryGetProperty("labelAttachment", out var path) && path.ValueKind == JsonValueKind.String
                ? path.GetString() : null;
        }
        catch (JsonException) { return null; }
    }

    public static JsonObject Details(Lead lead)
    {
        try { if (JsonNode.Parse(lead.Details) is JsonObject value) return value; }
        catch (JsonException) { }
        return string.IsNullOrWhiteSpace(lead.Details) || lead.Details == "{}" ? new() : new() { ["legacyDetails"] = lead.Details };
    }
}
