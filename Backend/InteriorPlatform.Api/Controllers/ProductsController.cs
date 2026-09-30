using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Public read-only product catalogue plus Admin product management.
/// Public endpoints expose active products only; Admin endpoints require
/// the Admin role and can see and change inactive products.
/// Physical deletion is not supported: DELETE deactivates via IsActive.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private static readonly string[] AllowedCategories =
        ["Sofas", "Beds", "Tables", "Chairs", "Wardrobes"];

    private static readonly string[] AllowedRooms =
        ["Living Room", "Bedroom", "Dining", "Workspace"];

    private readonly ApplicationDbContext _db;

    public ProductsController(ApplicationDbContext db)
    {
        _db = db;
    }

    // GET /api/products — active products only.
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<IEnumerable<ProductResponse>>> GetProducts()
    {
        var products = await _db.Products
            .AsNoTracking()
            .Where(p => p.IsActive)
            .OrderBy(p => p.Id)
            .Select(p => ToResponse(p))
            .ToListAsync();

        return Ok(products);
    }

    // GET /api/products/{id} — a single active product, else 404.
    [HttpGet("{id}")]
    [AllowAnonymous]
    public async Task<ActionResult<ProductResponse>> GetProduct(string id)
    {
        var product = await _db.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == id && p.IsActive);

        if (product is null)
        {
            return NotFound();
        }

        return Ok(ToResponse(product));
    }

    private static ProductResponse ToResponse(Product p) => new()
    {
        Id = p.Id,
        Name = p.Name,
        Category = p.Category,
        Room = p.Room,
        Price = p.Price,
        Material = p.Material,
        Finish = p.Finish,
        Blurb = p.Blurb,
        Description = p.Description,
        Dimensions = p.Dimensions,
        Image = p.ImageUrl,
        Details = p.Details,
    };

    private static AdminProductResponse ToAdminResponse(Product p) => new()
    {
        Id = p.Id,
        Name = p.Name,
        Category = p.Category,
        Room = p.Room,
        Price = p.Price,
        Material = p.Material,
        Finish = p.Finish,
        Blurb = p.Blurb,
        Description = p.Description,
        Dimensions = p.Dimensions,
        Image = p.ImageUrl,
        Details = p.Details,
        IsActive = p.IsActive,
    };

    /// <summary>
    /// Validates values DataAnnotations cannot express: allowed
    /// Category/Room sets, HTTP(S) image URL, and non-blank Details items.
    /// Returns false and records ModelState errors when invalid.
    /// </summary>
    private bool AddFieldErrors(
        string category,
        string room,
        string imageUrl,
        List<string>? details)
    {
        var valid = true;

        if (!AllowedCategories.Contains(category))
        {
            ModelState.AddModelError(
                "Category",
                $"Category must be one of: {string.Join(", ", AllowedCategories)}.");
            valid = false;
        }

        if (!AllowedRooms.Contains(room))
        {
            ModelState.AddModelError(
                "Room",
                $"Room must be one of: {string.Join(", ", AllowedRooms)}.");
            valid = false;
        }

        if (!Uri.TryCreate(imageUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            ModelState.AddModelError(
                "ImageUrl",
                "ImageUrl must be a valid absolute HTTP/HTTPS URL.");
            valid = false;
        }

        if (details is null || details.Count == 0 ||
            details.Any(d => string.IsNullOrWhiteSpace(d)))
        {
            ModelState.AddModelError(
                "Details",
                "Details must contain at least one non-empty item.");
            valid = false;
        }

        return valid;
    }

    // POST /api/products — Admin only. Id is an Admin-supplied slug.
    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<AdminProductResponse>> CreateProduct(
        [FromBody] ProductCreateRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AddFieldErrors(request.Category, request.Room, request.ImageUrl, request.Details) ||
            !ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (await _db.Products.AnyAsync(p => p.Id == request.Id))
        {
            return Conflict(new { Errors = new[] { $"A product with Id '{request.Id}' already exists." } });
        }

        var product = new Product
        {
            Id = request.Id,
            Name = request.Name,
            Category = request.Category,
            Room = request.Room,
            Price = request.Price,
            Material = request.Material,
            Finish = request.Finish,
            Blurb = request.Blurb,
            Description = request.Description,
            Dimensions = request.Dimensions,
            ImageUrl = request.ImageUrl,
            Details = request.Details,
            IsActive = request.IsActive,
        };

        _db.Products.Add(product);
        await _db.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetProduct),
            new { id = product.Id },
            ToAdminResponse(product));
    }

    // PUT /api/products/{id} — Admin only. Route id is authoritative;
    // Product.Id cannot be changed. Includes inactive products.
    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<AdminProductResponse>> UpdateProduct(
        string id,
        [FromBody] ProductUpdateRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (!AddFieldErrors(request.Category, request.Room, request.ImageUrl, request.Details) ||
            !ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        product.Name = request.Name;
        product.Category = request.Category;
        product.Room = request.Room;
        product.Price = request.Price;
        product.Material = request.Material;
        product.Finish = request.Finish;
        product.Blurb = request.Blurb;
        product.Description = request.Description;
        product.Dimensions = request.Dimensions;
        product.ImageUrl = request.ImageUrl;
        product.Details = request.Details;
        product.IsActive = request.IsActive;

        await _db.SaveChangesAsync();

        return Ok(ToAdminResponse(product));
    }

    // GET /api/products/admin — Admin only. Active AND inactive products.
    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<AdminProductResponse>>> GetAdminProducts()
    {
        var products = await _db.Products
            .AsNoTracking()
            .OrderBy(p => p.Id)
            .Select(p => ToAdminResponse(p))
            .ToListAsync();

        return Ok(products);
    }

    // DELETE /api/products/{id} — Admin only. Soft-delete: deactivates the
    // product instead of physically deleting the row. Idempotent.
    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteProduct(string id)
    {
        var product = await _db.Products.FirstOrDefaultAsync(p => p.Id == id);
        if (product is null)
        {
            return NotFound();
        }

        product.IsActive = false;
        await _db.SaveChangesAsync();

        return NoContent();
    }
}
