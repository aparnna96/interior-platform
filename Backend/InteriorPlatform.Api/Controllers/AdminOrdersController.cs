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
/// Read-only Admin view over all customer orders. Every endpoint requires
/// the Admin role; Customers and FieldStaff are rejected by authorization
/// before any data is touched. Customer endpoints keep enforcing ownership
/// separately — this controller never widens them. Order status is exposed
/// read-only: no status mutation API exists, so none is offered here.
/// </summary>
[ApiController]
[Route("api/admin/orders")]
[Authorize(Roles = "Admin")]
public class AdminOrdersController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public AdminOrdersController(ApplicationDbContext db)
    {
        _db = db;
    }

    // GET /api/admin/orders — every order, newest first, with the owner and
    // contact email resolved server-side for operations.
    [HttpGet]
    public async Task<ActionResult<IEnumerable<AdminOrderResponse>>> GetOrders()
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var orders = await (
            from o in _db.Orders.AsNoTracking()
            join u in _db.Users.AsNoTracking() on o.UserId equals u.Id into owners
            from u in owners.DefaultIfEmpty()
            orderby o.CreatedAt descending
            select new AdminOrderResponse
            {
                Id = o.Id,
                UserId = o.UserId,
                CustomerEmail = u != null ? u.Email : null,
                Status = o.Status,
                CreatedAt = o.CreatedAt,
                Subtotal = o.Subtotal,
                ItemCount = o.Items.Sum(i => i.Quantity),
            })
            .ToListAsync();

        return Ok(orders);
    }

    // GET /api/admin/orders/{id} — one order with snapshot lines, regardless
    // of owner. 404 when the order does not exist.
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<AdminOrderDetailResponse>> GetOrder(Guid id)
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        var order = await _db.Orders
            .AsNoTracking()
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == id);
        if (order is null)
        {
            return NotFound();
        }

        var email = await _db.Users
            .AsNoTracking()
            .Where(u => u.Id == order.UserId)
            .Select(u => u.Email)
            .FirstOrDefaultAsync();

        return Ok(ToDetail(order, email));
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

    private static AdminOrderDetailResponse ToDetail(Order order, string? customerEmail) => new()
    {
        Id = order.Id,
        UserId = order.UserId,
        CustomerEmail = customerEmail,
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
