namespace InteriorPlatform.Api.Models;

/// <summary>
/// A single line inside an <see cref="Order"/>.
/// <see cref="ProductName"/> and <see cref="UnitPrice"/> are snapshots taken
/// from the product at order time: historical orders never depend on the
/// current <c>Product.Name</c> or <c>Product.Price</c>.
/// <see cref="ProductId"/> references the <c>Products.Id</c> slug (string PK),
/// matching the existing catalogue convention (see <see cref="Lead"/>).
/// </summary>
public class OrderItem
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    public Guid OrderId { get; set; }

    /// <summary>Referenced product slug (Products.Id) at order time.</summary>
    public string ProductId { get; set; } = string.Empty;

    /// <summary>Product name snapshot at order time.</summary>
    public string ProductName { get; set; } = string.Empty;

    /// <summary>Product price snapshot at order time. Decimal money.</summary>
    public decimal UnitPrice { get; set; }

    /// <summary>Units of the product. Always 1-99 (copied from the cart).</summary>
    public int Quantity { get; set; }

    /// <summary>UnitPrice * Quantity, computed server-side. Decimal money.</summary>
    public decimal LineTotal { get; set; }

    public Order Order { get; set; } = null!;

    public Product Product { get; set; } = null!;
}
