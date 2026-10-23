namespace Jermiq.Web.Models;

// Stored privately in Settings. Only the explicit public projection may be returned to visitors.
public sealed class ProductReview
{
    public string Id { get; set; } = "";
    public string ProductSlug { get; set; } = "";
    public string ProductTitle { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public int Rating { get; set; }
    public string Message { get; set; } = "";
    public string Status { get; set; } = "pending";
    public long CreatedAt { get; set; }
    public long Revision { get; set; }
    public string PayloadHash { get; set; } = "";
}

public sealed record PublicProductReview(string Id, string Name, int Rating, string Message, long CreatedAt);
public sealed record AdminProductReview(string Id, string ProductSlug, string ProductTitle, string Name,
    string Email, int Rating, string Message, string Status, long CreatedAt, long Revision);
public sealed record ProductReviewPage(List<PublicProductReview> Reviews, double? AverageRating, int Total, int Page, int PageSize);
