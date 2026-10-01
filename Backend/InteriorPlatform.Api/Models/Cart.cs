namespace InteriorPlatform.Api.Models;

/// <summary>
/// Database-backed shopping cart. Exactly one cart per user, enforced by a
/// unique index on <see cref="UserId"/> (see <c>CartConfiguration</c>).
/// <see cref="CreatedAt"/>/<see cref="UpdatedAt"/> are always set from
/// server-side application code (UTC) — never supplied by a request.
/// </summary>
public class Cart
{
    /// <summary>Server-generated identifier.</summary>
    public Guid Id { get; set; }

    /// <summary>Owner (AspNetUsers.Id). Never accepted from the client.</summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>Server-set UTC creation time.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Server-set UTC last-mutation time.</summary>
    public DateTime UpdatedAt { get; set; }

    public List<CartItem> Items { get; set; } = [];
}
