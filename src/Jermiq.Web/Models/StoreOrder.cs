namespace Jermiq.Web.Models;

public sealed class StoreOrder
{
    public string Id { get; set; } = "";
    public long CreatedAt { get; set; }
    public long Revision { get; set; }
    public string Status { get; set; } = "new";
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public string Address { get; set; } = "";
    public string DeliveryMethod { get; set; } = "pickup";
    public string PaymentMethod { get; set; } = "manager";
    public string Message { get; set; } = "";
    public List<StoreOrderItem> Items { get; set; } = [];
    public string Currency { get; set; } = "AMD";
    public decimal? Subtotal { get; set; }
    public decimal KnownSubtotal { get; set; }
    public decimal? DeliveryPrice { get; set; }
    public bool RequiresConfirmation { get; set; }
}

public sealed class StoreOrderItem
{
    public string Slug { get; set; } = "";
    public string Title { get; set; } = "";
    public string Sku { get; set; } = "";
    public int Quantity { get; set; }
    public decimal? UnitPrice { get; set; }
    public bool PriceIsEstimate { get; set; }
    public decimal? LineTotal { get; set; }
}

public sealed class StoreOrderRequest
{
    public string RequestId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public string Address { get; set; } = "";
    public string DeliveryMethod { get; set; } = "pickup";
    public string PaymentMethod { get; set; } = "manager";
    public string Message { get; set; } = "";
    public bool Consent { get; set; }
    public List<StoreOrderRequestItem> Items { get; set; } = [];
}

public sealed class StoreOrderRequestItem
{
    public string Slug { get; set; } = "";
    public int Quantity { get; set; }
}

// The payload hash is intentionally stored separately from the response snapshot.
public sealed class StoredOrder
{
    public string PayloadHash { get; set; } = "";
    public StoreOrder Order { get; set; } = new();
}

public sealed class StoreOrderStatusEdit
{
    public long Revision { get; set; }
    public string Status { get; set; } = "";
}
