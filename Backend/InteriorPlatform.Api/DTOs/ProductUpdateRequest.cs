using System.ComponentModel.DataAnnotations;

namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for PUT /api/products/{id} (Admin only).
/// The route id is authoritative; Product.Id cannot be changed here.
/// </summary>
public class ProductUpdateRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [StringLength(32)]
    public string Category { get; set; } = string.Empty;

    [Required]
    [StringLength(32)]
    public string Room { get; set; } = string.Empty;

    [Range(1, int.MaxValue, ErrorMessage = "Price must be greater than 0.")]
    public int Price { get; set; }

    [Required]
    [StringLength(200)]
    public string Material { get; set; } = string.Empty;

    [Required]
    [StringLength(200)]
    public string Finish { get; set; } = string.Empty;

    [Required]
    [StringLength(500)]
    public string Blurb { get; set; } = string.Empty;

    [Required]
    [StringLength(2000)]
    public string Description { get; set; } = string.Empty;

    [Required]
    [StringLength(100)]
    public string Dimensions { get; set; } = string.Empty;

    [Required]
    [StringLength(2000)]
    [Url(ErrorMessage = "ImageUrl must be a valid absolute URL.")]
    public string ImageUrl { get; set; } = string.Empty;

    [Required]
    [MinLength(1, ErrorMessage = "Details must contain at least one item.")]
    public List<string> Details { get; set; } = [];

    public bool IsActive { get; set; }
}
