using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Read-only public product catalogue. No authentication: the public
/// catalogue needs to read products. Only active products are exposed.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
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
}
