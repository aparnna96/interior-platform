namespace InteriorPlatform.Api.Models;

/// <summary>
/// A single product line inside a <see cref="Cart"/>.
/// <see cref="ProductId"/> references the <c>Products.Id</c> slug (string PK),
/// matching the existing catalogue convention (see <see cref="Lead"/>).
/// No price is snapshotted here: cart totals always use the current
/// <c>Product.Price</c>. <see cref="Quantity"/> is constrained to 1-99 by
/// request validation and a database check constraint.
/// </summary>
public class CartItem
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    public Guid CartId { get; set; }

    /// <summary>Referenced product slug (Products.Id).</summary>
    public string ProductId { get; set; } = string.Empty;

    /// <summary>Units of the product. Always 1-99.</summary>
    public int Quantity { get; set; }

    public Cart Cart { get; set; } = null!;

    public Product Product { get; set; } = null!;
}
