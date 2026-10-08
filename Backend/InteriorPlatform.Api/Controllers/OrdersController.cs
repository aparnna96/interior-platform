using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.RegularExpressions;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Persistent orders created from the authenticated customer's cart. The
/// owning user, the initial status (<see cref="OrderStatus.Pending"/>) and
/// every price/total are derived server-side — the request body carries only the delivery details,
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
    // order. The body carries only the delivery details: user, products, prices and status all
    // come from the server. Order creation and cart clearing run in one
    // transaction, so they both succeed or both roll back.
    [HttpPost]
    public async Task<ActionResult<OrderDetailResponse>> CreateOrder(
        [FromBody] CreateOrderRequest? request)
    {
        var userId = ResolveUserId();
        if (userId is null)
        {
            return Unauthorized();
        }

        // Delivery details are required: a missing body, an empty body ({}) or
        // any invalid field is a 400 before the cart is even read.
        var delivery = ValidateDelivery(request);
        if (delivery is null)
        {
            return ValidationProblem(ModelState);
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
            DeliveryFullName = delivery.FullName,
            DeliveryPhone = delivery.Phone,
            DeliveryAddressLine1 = delivery.AddressLine1,
            DeliveryAddressLine2 = delivery.AddressLine2,
            DeliveryCity = delivery.City,
            DeliveryState = delivery.State,
            DeliveryPincode = delivery.Pincode,
            DeliveryNotes = delivery.Notes,
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

    private static readonly Regex TenDigits =
        new("^[0-9]{10}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex SixDigits =
        new("^[0-9]{6}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /// <summary>Trimmed, validated delivery values ready to store.</summary>
    private sealed record CleanDelivery(
        string FullName,
        string Phone,
        string AddressLine1,
        string? AddressLine2,
        string City,
        string State,
        string Pincode,
        string? Notes);

    /// <summary>
    /// Trims every value, then checks the rules. Adds one ModelState error per
    /// bad field (keyed by the request property name) and returns null when
    /// anything is wrong. Whitespace-only counts as missing. Phone: spaces and
    /// hyphens are ignored, one leading +91 is dropped, then exactly 10 digits.
    /// </summary>
    private CleanDelivery? ValidateDelivery(CreateOrderRequest? request)
    {
        if (request is null)
        {
            ModelState.AddModelError("Delivery", "Delivery details are required.");
            return null;
        }

        static string? Clean(string? value)
        {
            var trimmed = value?.Trim();
            return string.IsNullOrEmpty(trimmed) ? null : trimmed;
        }

        var valid = true;

        string? Required(string? raw, string key, string label, int min, int max)
        {
            var value = Clean(raw);
            if (value is null)
            {
                ModelState.AddModelError(key, $"{label} is required.");
                valid = false;
                return null;
            }

            if (value.Length < min || value.Length > max)
            {
                ModelState.AddModelError(
                    key,
                    min > 1
                        ? $"{label} must be {min} to {max} characters."
                        : $"{label} must be at most {max} characters.");
                valid = false;
                return null;
            }

            return value;
        }

        string? Optional(string? raw, string key, string label, int max)
        {
            var value = Clean(raw);
            if (value is not null && value.Length > max)
            {
                ModelState.AddModelError(key, $"{label} must be at most {max} characters.");
                valid = false;
                return null;
            }

            return value;
        }

        var fullName = Required(request.FullName, nameof(CreateOrderRequest.FullName), "Full name", 2, 100);
        var line1 = Required(request.AddressLine1, nameof(CreateOrderRequest.AddressLine1), "Address line 1", 1, 200);
        var line2 = Optional(request.AddressLine2, nameof(CreateOrderRequest.AddressLine2), "Address line 2", 200);
        var city = Required(request.City, nameof(CreateOrderRequest.City), "City", 1, 100);
        var state = Required(request.State, nameof(CreateOrderRequest.State), "State", 1, 100);
        var notes = Optional(request.DeliveryNotes, nameof(CreateOrderRequest.DeliveryNotes), "Delivery notes", 500);

        string? phone = null;
        var rawPhone = Clean(request.Phone);
        if (rawPhone is null)
        {
            ModelState.AddModelError(nameof(CreateOrderRequest.Phone), "Phone is required.");
            valid = false;
        }
        else
        {
            var digits = rawPhone.Replace(" ", string.Empty).Replace("-", string.Empty);
            if (digits.StartsWith("+91", StringComparison.Ordinal))
            {
                digits = digits[3..];
            }

            if (!TenDigits.IsMatch(digits))
            {
                ModelState.AddModelError(
                    nameof(CreateOrderRequest.Phone),
                    "Phone must be a 10 digit mobile number.");
                valid = false;
            }
            else
            {
                phone = digits;
            }
        }

        string? pincode = null;
        var rawPincode = Clean(request.Pincode);
        if (rawPincode is null)
        {
            ModelState.AddModelError(nameof(CreateOrderRequest.Pincode), "Pincode is required.");
            valid = false;
        }
        else if (!SixDigits.IsMatch(rawPincode))
        {
            ModelState.AddModelError(nameof(CreateOrderRequest.Pincode), "Pincode must be 6 digits.");
            valid = false;
        }
        else
        {
            pincode = rawPincode;
        }

        if (!valid || fullName is null || line1 is null || city is null || state is null || phone is null || pincode is null)
        {
            return null;
        }

        return new CleanDelivery(fullName, phone, line1, line2, city, state, pincode, notes);
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
        Delivery = DeliveryDetailsResponse.From(order),
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
