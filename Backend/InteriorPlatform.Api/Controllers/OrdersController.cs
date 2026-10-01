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
/// Persistent orders created from the authenticated customer's cart. The
/// owning user, the initial status (<see cref="OrderStatus.Pending"/>) and
/// every price/total are derived server-side — the request carries no body,
/// so the client can influence neither prices nor status. Every lookup is
/// scoped to the current user's orders, so one customer can never see
/// another customer's orders.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class OrdersController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public OrdersController(ApplicationDbContext db)
    {
        _db = db;
    }

    // GET /api/orders — current user's orders, newest first.
    [HttpGet]
    public async Task<ActionResult<IEnumerable<OrderResponse>>> GetOrders()
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var orders = await _db.Orders
            .AsNoTracking()
            .Where(o => o.UserId == userId)
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new OrderResponse
            {
                Id = o.Id,
                Status = o.Status,
                CreatedAt = o.CreatedAt,
                Subtotal = o.Subtotal,
                ItemCount = o.Items.Sum(i => i.Quantity),
            })
            .ToListAsync();

        return Ok(orders);
    }

    // GET /api/orders/{id} — one of the current user's orders with lines.
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderDetailResponse>> GetOrder(Guid id)
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var order = await _db.Orders
            .AsNoTracking()
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (order is null)
        {
            return NotFound();
        }

        return Ok(ToDetail(order));
    }

    // POST /api/orders — convert the current user's cart into a Pending
    // order. The body carries nothing: user, products, prices and status all
    // come from the server. Order creation and cart clearing run in one
    // transaction, so they both succeed or both roll back.
    [HttpPost]
    public async Task<ActionResult<OrderDetailResponse>> CreateOrder()
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var cart = await _db.Carts
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.UserId == userId);
        if (cart is null || cart.Items.Count == 0)
        {
            ModelState.AddModelError("Cart", "The cart is empty.");
            return ValidationProblem(ModelState);
        }

        var productIds = cart.Items.Select(i => i.ProductId).Distinct().ToList();
        var products = await _db.Products
            .AsNoTracking()
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id);

        // Every line must still resolve to an active product. Validate all
        // lines before creating anything: no partial orders. Missing and
        // inactive products are reported the same way (404-worthy lookup
        // collapsed to 400 here so a stale cart cannot leak catalog state).
        foreach (var item in cart.Items)
        {
            if (!products.TryGetValue(item.ProductId, out var product) || !product.IsActive)
            {
                ModelState.AddModelError(
                    "Cart",
                    $"Product '{item.ProductId}' is no longer available.");
                return ValidationProblem(ModelState);
            }
        }

        var now = DateTime.UtcNow;
        var order = new Order
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Status = OrderStatus.Pending,
            CreatedAt = now,
            UpdatedAt = now,
        };

        foreach (var item in cart.Items.OrderBy(i => i.ProductId))
        {
            var product = products[item.ProductId];
            var unitPrice = (decimal)product.Price;
            var lineTotal = unitPrice * item.Quantity;
            order.Subtotal += lineTotal;
            order.Items.Add(new OrderItem
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ProductId = product.Id,
                ProductName = product.Name,
                UnitPrice = unitPrice,
                Quantity = item.Quantity,
                LineTotal = lineTotal,
            });
        }

        await using var transaction = await _db.Database.BeginTransactionAsync();
        _db.Orders.Add(order);
        _db.CartItems.RemoveRange(cart.Items);
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return CreatedAtAction(nameof(GetOrder), new { id = order.Id }, ToDetail(order));
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

    private static OrderDetailResponse ToDetail(Order order) => new()
    {
        Id = order.Id,
        Status = order.Status,
        CreatedAt = order.CreatedAt,
        UpdatedAt = order.UpdatedAt,
        Subtotal = order.Subtotal,
        Items = order.Items
            .OrderBy(i => i.ProductId)
            .Select(i => new OrderItemResponse
            {
                Id = i.Id,
                ProductId = i.ProductId,
                ProductName = i.ProductName,
                UnitPrice = i.UnitPrice,
                Quantity = i.Quantity,
                LineTotal = i.LineTotal,
            })
            .ToList(),
    };
}
