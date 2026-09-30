namespace InteriorPlatform.Api.Models;

/// <summary>
/// Catalogue product entity (read-only public API milestone).
///
/// Mirrors the existing Angular <c>CatalogueProduct</c> contract:
/// <list type="bullet">
/// <item><see cref="Id"/> keeps the current frontend slug (e.g. "aria-3s-sofa").</item>
/// <item><see cref="Price"/> is a whole-number INR price, matching the frontend.</item>
/// <item><see cref="Dimensions"/> stays free text — never parsed.</item>
/// <item><see cref="Details"/> preserves the frontend string-array concept,
/// stored as JSON (see <c>ProductConfiguration</c>).</item>
/// </list>
/// There is intentionally no <c>Swatch</c> property: the frontend swatch is
/// only a UI loading/background tint, not product data.
/// <see cref="IsActive"/> lets inactive products be hidden from the public
/// catalogue later.
/// </summary>
public class Product
{
    /// <summary>Frontend slug, e.g. "aria-3s-sofa".</summary>
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    /// <summary>One of the Angular catalogue categories (Sofas, Beds, Tables, Chairs, Wardrobes).</summary>
    public string Category { get; set; } = string.Empty;

    /// <summary>One of the Angular catalogue rooms (Living Room, Bedroom, Dining, Workspace).</summary>
    public string Room { get; set; } = string.Empty;

    /// <summary>Whole-number INR price.</summary>
    public int Price { get; set; }

    public string Material { get; set; } = string.Empty;

    public string Finish { get; set; } = string.Empty;

    public string Blurb { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    /// <summary>Free-text size, e.g. "220 × 92 × 82 cm".</summary>
    public string Dimensions { get; set; } = string.Empty;

    public string ImageUrl { get; set; } = string.Empty;

    /// <summary>Bullet points shown on the product-details page.</summary>
    public List<string> Details { get; set; } = [];

    public bool IsActive { get; set; } = true;
}
