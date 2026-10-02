namespace InteriorPlatform.Api.Models;

/// <summary>
/// A single snapshot line inside a <see cref="Proposal"/>.
/// <see cref="ProductName"/> and <see cref="UnitPrice"/> are snapshots taken
/// from the product at proposal time: historical proposals never depend on
/// the current <c>Product.Name</c> or <c>Product.Price</c>.
/// <see cref="ProductId"/> references the <c>Products.Id</c> slug (string PK),
/// matching the existing catalogue convention (see <see cref="OrderItem"/>).
/// </summary>
public class ProposalItem
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    public Guid ProposalId { get; set; }

    /// <summary>Referenced product slug (Products.Id) at proposal time.</summary>
    public string ProductId { get; set; } = string.Empty;

    /// <summary>Product name snapshot at proposal time.</summary>
    public string ProductName { get; set; } = string.Empty;

    /// <summary>Product price snapshot at proposal time. Decimal money.</summary>
    public decimal UnitPrice { get; set; }

    /// <summary>Units of the product. Always 1-99 (copied from the cart).</summary>
    public int Quantity { get; set; }

    /// <summary>UnitPrice * Quantity, computed server-side. Decimal money.</summary>
    public decimal LineTotal { get; set; }

    public Proposal Proposal { get; set; } = null!;

    public Product Product { get; set; } = null!;
}
