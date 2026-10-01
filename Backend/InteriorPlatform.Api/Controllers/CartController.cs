using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Database-backed shopping cart for authenticated users. The owning user is
/// always derived from the authenticated identity — UserId is never accepted
/// from the client, and every item lookup is scoped to the current user's
/// cart, so one user can never read or mutate another user's cart.
/// Totals are computed server-side from the current product prices; no price
/// is snapshotted on the cart item.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CartController : ControllerBase
{
    private const int MinQuantity = 1;
    private const int MaxQuantity = 99;

    private readonly ApplicationDbContext _db;

    public CartController(ApplicationDbContext db)
    {
        _db = db;
    }

    // GET /api/cart — current user's cart, created on first read.
    [HttpGet]
    public async Task<ActionResult<CartResponse>> GetCart()
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var cart = await GetOrCreateCartAsync(userId);
        return Ok(ToResponse(cart));
    }

    // POST /api/cart/items — add a product. Merges when already present.
    [HttpPost("items")]
    public async Task<ActionResult<CartResponse>> AddItem(
        [FromBody] AddCartItemRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (string.IsNullOrWhiteSpace(request.ProductId))
        {
            ModelState.AddModelError(
                nameof(AddCartItemRequest.ProductId),
                "ProductId is required.");
            return ValidationProblem(ModelState);
        }

        if (request.Quantity is < MinQuantity or > MaxQuantity)
        {
            ModelState.AddModelError(
                nameof(AddCartItemRequest.Quantity),
                $"Quantity must be between {MinQuantity} and {MaxQuantity}.");
            return ValidationProblem(ModelState);
        }

        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        // Only active products can be newly added. Inactive or missing
        // products are reported as 404 without leaking which case it was.
        var product = await _db.Products
            .FirstOrDefaultAsync(p => p.Id == request.ProductId);
        if (product is null || !product.IsActive)
        {
            return NotFound();
        }

        var cart = await GetOrCreateCartAsync(userId);

        var existing = cart.Items.FirstOrDefault(i => i.ProductId == request.ProductId);
        if (existing is null)
        {
            _db.CartItems.Add(new CartItem
            {
                Id = Guid.NewGuid(),
                CartId = cart.Id,
                ProductId = request.ProductId,
                Quantity = request.Quantity,
            });
        }
        else
        {
            var merged = existing.Quantity + request.Quantity;
            if (merged > MaxQuantity)
            {
                ModelState.AddModelError(
                    nameof(AddCartItemRequest.Quantity),
                    $"Quantity must be between {MinQuantity} and {MaxQuantity}.");
                return ValidationProblem(ModelState);
            }

            existing.Quantity = merged;
        }

        cart.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var updated = await GetCartAsync(userId);
        if (updated is null)
        {
            return NotFound();
        }

        return Ok(ToResponse(updated));
    }

    // PUT /api/cart/items/{itemId} — set quantity. Current user's items only.
    [HttpPut("items/{itemId:guid}")]
    public async Task<ActionResult<CartResponse>> UpdateItem(
        Guid itemId,
        [FromBody] UpdateCartItemRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        if (request.Quantity is < MinQuantity or > MaxQuantity)
        {
            ModelState.AddModelError(
                nameof(UpdateCartItemRequest.Quantity),
                $"Quantity must be between {MinQuantity} and {MaxQuantity}.");
            return ValidationProblem(ModelState);
        }

        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var item = await _db.CartItems
            .Include(i => i.Cart)
            .FirstOrDefaultAsync(i => i.Id == itemId && i.Cart.UserId == userId);
        if (item is null)
        {
            return NotFound();
        }

        item.Quantity = request.Quantity;
        item.Cart.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var cart = await GetCartAsync(userId);
        if (cart is null)
        {
            return NotFound();
        }

        return Ok(ToResponse(cart));
    }

    // DELETE /api/cart/items/{itemId} — remove one of the current user's items.
    [HttpDelete("items/{itemId:guid}")]
    public async Task<IActionResult> RemoveItem(Guid itemId)
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var item = await _db.CartItems
            .Include(i => i.Cart)
            .FirstOrDefaultAsync(i => i.Id == itemId && i.Cart.UserId == userId);
        if (item is null)
        {
            return NotFound();
        }

        _db.CartItems.Remove(item);
        item.Cart.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    /// <summary>
    /// Derives the acting user from the authenticated identity only.
    /// The JWT carries the user id in the "sub" claim, mapped by the JWT
    /// handler to <see cref="ClaimTypes.NameIdentifier"/>. Null when the
    /// request is anonymous or the claim is unexpectedly missing — client
    /// data is never trusted here.
    /// </summary>
    private string? ResolveUserId()
    {
        if (User?.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        return User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
    }

    private async Task<Cart?> GetCartAsync(string userId) =>
        await _db.Carts
            .Include(c => c.Items)
                .ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(c => c.UserId == userId);

    private async Task<Cart> GetOrCreateCartAsync(string userId)
    {
        var cart = await GetCartAsync(userId);
        if (cart is not null)
        {
            return cart;
        }

        var now = DateTime.UtcNow;
        cart = new Cart
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.Carts.Add(cart);
        await _db.SaveChangesAsync();
        return cart;
    }

    private static CartResponse ToResponse(Cart cart)
    {
        var items = cart.Items
            .Select(i =>
            {
                var price = i.Product?.Price ?? 0;
                return new CartItemResponse
                {
                    Id = i.Id,
                    ProductId = i.ProductId,
                    Slug = i.ProductId,
                    Name = i.Product?.Name ?? string.Empty,
                    Price = price,
                    Quantity = i.Quantity,
                    LineTotal = price * i.Quantity,
                    ImageUrl = i.Product?.ImageUrl ?? string.Empty,
                    IsAvailable = i.Product?.IsActive ?? false,
                };
            })
            .OrderBy(i => i.Slug)
            .ToList();

        return new CartResponse
        {
            Items = items,
            ItemCount = items.Sum(i => i.Quantity),
            Subtotal = items.Sum(i => i.LineTotal),
        };
    }
}
