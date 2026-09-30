namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Public product shape. Property names mirror the existing Angular
/// <c>CatalogueProduct</c> contract so the frontend can map 1:1:
/// <c>Image</c> is projected from the <c>Product.ImageUrl</c> column and
/// <c>Details</c> from the stored JSON array. No swatch (UI-only tint).
/// Serialized camelCase by the default JSON options (id, name, …, image).
/// </summary>
public class ProductResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Room { get; set; } = string.Empty;
    public int Price { get; set; }
    public string Material { get; set; } = string.Empty;
    public string Finish { get; set; } = string.Empty;
    public string Blurb { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Dimensions { get; set; } = string.Empty;
    public string Image { get; set; } = string.Empty;
    public List<string> Details { get; set; } = [];
}
