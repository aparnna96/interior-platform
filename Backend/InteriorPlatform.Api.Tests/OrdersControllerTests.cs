using InteriorPlatform.Api.Controllers;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using System.Reflection;
using System.Security.Claims;
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Order rules (Task 6). SQLite in-memory is used for relational fidelity
/// (FKs, transactions). These tests never touch the real SQL Server database.
/// </summary>
public sealed class OrdersControllerTests
{
    private const string UserA = "user-a";
    private const string UserB = "user-b";
    private const string SofaId = "aria-3s-sofa";
    private const string ChairId = "milo-dining-chair";
    private const int SofaPrice = 42999;
    private const int ChairPrice = 14499;

    private sealed class TestDb : IDisposable
    {
        public ApplicationDbContext Db { get; }

        private readonly SqliteConnection _connection;

        public TestDb()
        {
            _connection = new SqliteConnection("DataSource=:memory:");
            _connection.Open();
            Db = new ApplicationDbContext(
                new DbContextOptionsBuilder<ApplicationDbContext>()
                    .UseSqlite(_connection)
                    .Options);
            Db.Database.EnsureCreated();

            Db.Users.AddRange(
                new ApplicationUser { Id = UserA, UserName = "a@test.local" },
                new ApplicationUser { Id = UserB, UserName = "b@test.local" });
            Db.Products.AddRange(
                TestProduct(SofaId, "Aria 3-Seater Fabric Sofa", SofaPrice),
                TestProduct(ChairId, "Milo Dining Chair", ChairPrice));
            Db.SaveChanges();
        }

        public void Dispose()
        {
            Db.Dispose();
            _connection.Dispose();
        }
    }

    private static Product TestProduct(string id, string name, int price) => new()
    {
        Id = id,
        Name = name,
        Category = "Sofas",
        Room = "Living Room",
        Price = price,
        Material = "Test Material",
        Finish = "Test Finish",
        Blurb = $"{id} blurb.",
        Description = $"{id} description.",
        Dimensions = "10 x 10 x 10 cm",
        ImageUrl = $"https://example.com/{id}.jpg",
        Details = [$"{id} detail"],
        IsActive = true,
    };

    private static ClaimsPrincipal PrincipalFor(string? userId) =>
        userId is null
            ? new ClaimsPrincipal(new ClaimsIdentity())
            : new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId)], "Test"));

    private static CartController CartFor(ApplicationDbContext db, string? userId)
    {
        var controller = new CartController(db);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(userId) },
        };
        return controller;
    }

    private static OrdersController OrdersFor(ApplicationDbContext db, string? userId)
    {
        var controller = new OrdersController(db);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(userId) },
        };
        return controller;
    }

    private static async Task AddToCart(ApplicationDbContext db, string userId, string productId, int quantity)
    {
        var result = await CartFor(db, userId).AddItem(new AddCartItemRequest
        {
            ProductId = productId,
            Quantity = quantity,
        });
        Assert.IsType<OkObjectResult>(result.Result);
    }

    private static OrderDetailResponse CreatedOrder(ActionResult<OrderDetailResponse> result)
    {
        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(StatusCodes.Status201Created, created.StatusCode);
        return Assert.IsType<OrderDetailResponse>(created.Value);
    }

    private static void BadRequest(ActionResult<OrderDetailResponse> result)
    {
        var bad = Assert.IsType<ObjectResult>(result.Result);
        Assert.True(
            bad.StatusCode == StatusCodes.Status400BadRequest ||
            (bad.StatusCode is null && bad.Value is ValidationProblemDetails),
            $"Expected 400, got {bad.StatusCode}.");
    }

    [Fact]
    public void OrdersController_RequiresAuthorization()
    {
        Assert.True(typeof(OrdersController).GetCustomAttributes(
            typeof(AuthorizeAttribute), inherit: true).Any());
    }

    [Fact]
    public void CreateOrder_TakesNoBody_ClientCannotInfluencePriceOrStatus()
    {
        // The action must not bind anything from the request: no prices,
        // totals, product names, user ids, or status can reach the server.
        var method = typeof(OrdersController).GetMethod(
            nameof(OrdersController.CreateOrder),
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);
        Assert.Empty(method.GetParameters());
    }

    [Fact]
    public async Task CreateOrder_FromCart_CreatesPendingOrderWithSnapshotsAndTotals()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 2);
        await AddToCart(test.Db, UserA, ChairId, 1);

        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder());

        Assert.Equal(OrderStatus.Pending, order.Status);
        Assert.Equal(2, order.Items.Count);

        var sofa = Assert.Single(order.Items, i => i.ProductId == SofaId);
        Assert.Equal("Aria 3-Seater Fabric Sofa", sofa.ProductName);
        Assert.Equal((decimal)SofaPrice, sofa.UnitPrice);
        Assert.Equal(2, sofa.Quantity);
        Assert.Equal(2 * (decimal)SofaPrice, sofa.LineTotal);

        var chair = Assert.Single(order.Items, i => i.ProductId == ChairId);
        Assert.Equal(ChairPrice, (int)chair.UnitPrice);
        Assert.Equal(1, chair.Quantity);

        var expected = 2 * (decimal)SofaPrice + ChairPrice;
        Assert.Equal(expected, order.Subtotal);
        Assert.Equal(order.Items.Sum(i => i.LineTotal), order.Subtotal);
    }

    [Fact]
    public async Task CreateOrder_ClearsCartItemsButKeepsCart()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder());

        var cartResult = await CartFor(test.Db, UserA).GetCart();
        var cart = Assert.IsType<CartResponse>(
            Assert.IsType<OkObjectResult>(cartResult.Result).Value);
        Assert.Empty(cart.Items);
        Assert.Equal(0, cart.ItemCount);
        Assert.True(await test.Db.Carts.AnyAsync(c => c.UserId == UserA));
    }

    [Fact]
    public async Task CreateOrder_EmptyCart_Returns400()
    {
        using var test = new TestDb();

        // No cart at all.
        BadRequest(await OrdersFor(test.Db, UserA).CreateOrder());

        // Existing but empty cart.
        var cartResult = await CartFor(test.Db, UserA).GetCart();
        Assert.IsType<OkObjectResult>(cartResult.Result);
        BadRequest(await OrdersFor(test.Db, UserA).CreateOrder());

        Assert.Equal(0, await test.Db.Orders.CountAsync());
    }

    [Fact]
    public async Task CreateOrder_InactiveProduct_Returns400WithoutPartialState()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        test.Db.Products.Single(p => p.Id == SofaId).IsActive = false;
        await test.Db.SaveChangesAsync();

        BadRequest(await OrdersFor(test.Db, UserA).CreateOrder());

        // Transactional all-or-nothing: no order, cart untouched.
        Assert.Equal(0, await test.Db.Orders.CountAsync());
        Assert.Equal(0, await test.Db.OrderItems.CountAsync());
        Assert.Equal(1, await test.Db.CartItems.CountAsync());
    }

    [Fact]
    public async Task CreateOrder_MissingProduct_Returns400WithoutPartialState()
    {
        using var test = new TestDb();
        var cartResult = await CartFor(test.Db, UserA).GetCart();
        Assert.IsType<OkObjectResult>(cartResult.Result);
        var cartId = await test.Db.Carts
            .Where(c => c.UserId == UserA)
            .Select(c => c.Id)
            .SingleAsync();

        // A row the API could never create through normal writes (the FK
        // would reject it): simulates a product deleted out-of-band.
        test.Db.Database.ExecuteSqlRaw("PRAGMA foreign_keys = OFF;");
        test.Db.CartItems.Add(new CartItem
        {
            Id = Guid.NewGuid(),
            CartId = cartId,
            ProductId = "ghost-product",
            Quantity = 1,
        });
        await test.Db.SaveChangesAsync();
        test.Db.Database.ExecuteSqlRaw("PRAGMA foreign_keys = ON;");

        BadRequest(await OrdersFor(test.Db, UserA).CreateOrder());

        Assert.Equal(0, await test.Db.Orders.CountAsync());
        Assert.Equal(1, await test.Db.CartItems.CountAsync());
    }

    [Fact]
    public async Task CreateOrder_UsesCurrentDatabasePrices()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 2);

        const int newPrice = SofaPrice + 1000;
        test.Db.Products.Single(p => p.Id == SofaId).Price = newPrice;
        await test.Db.SaveChangesAsync();

        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder());
        Assert.Equal(2 * (decimal)newPrice, order.Subtotal);
        Assert.Equal(2 * (decimal)newPrice, Assert.Single(order.Items).LineTotal);
    }

    [Fact]
    public async Task OrderHistory_SurvivesProductChanges()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);
        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder());

        var product = test.Db.Products.Single(p => p.Id == SofaId);
        product.Name = "Renamed Sofa";
        product.Price = 1;
        product.IsActive = false;
        await test.Db.SaveChangesAsync();

        var reloaded = await OrdersFor(test.Db, UserA).GetOrder(order.Id);
        var detail = Assert.IsType<OrderDetailResponse>(
            Assert.IsType<OkObjectResult>(reloaded.Result).Value);
        var item = Assert.Single(detail.Items);
        Assert.Equal("Aria 3-Seater Fabric Sofa", item.ProductName);
        Assert.Equal((decimal)SofaPrice, item.UnitPrice);
        Assert.Equal((decimal)SofaPrice, detail.Subtotal);
    }

    [Fact]
    public async Task GetOrders_ReturnsOnlyOwnOrdersNewestFirst()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);
        var first = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder());

        await AddToCart(test.Db, UserB, ChairId, 1);
        CreatedOrder(await OrdersFor(test.Db, UserB).CreateOrder());

        await AddToCart(test.Db, UserA, ChairId, 2);
        var second = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder());

        var listResult = await OrdersFor(test.Db, UserA).GetOrders();
        var list = Assert.IsType<List<OrderResponse>>(
            Assert.IsType<OkObjectResult>(listResult.Result).Value);

        Assert.Equal(2, list.Count);
        Assert.DoesNotContain(list, o => o.Status != OrderStatus.Pending);
        Assert.Equal(second.Id, list[0].Id);
        Assert.Equal(first.Id, list[1].Id);
        Assert.True(list[0].CreatedAt >= list[1].CreatedAt);
        Assert.Equal(2, list[0].ItemCount);
        Assert.Equal(2 * (decimal)ChairPrice, list[0].Subtotal);
    }

    [Fact]
    public async Task GetOrder_OwnOrder_ReturnsDetail()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 3);
        var created = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder());

        var result = await OrdersFor(test.Db, UserA).GetOrder(created.Id);
        var detail = Assert.IsType<OrderDetailResponse>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(created.Id, detail.Id);
        Assert.Equal(OrderStatus.Pending, detail.Status);
        Assert.Equal(3 * (decimal)SofaPrice, detail.Subtotal);
        var item = Assert.Single(detail.Items);
        Assert.Equal(SofaId, item.ProductId);
        Assert.Equal("Aria 3-Seater Fabric Sofa", item.ProductName);
        Assert.Equal((decimal)SofaPrice, item.UnitPrice);
        Assert.Equal(3, item.Quantity);
        Assert.Equal(3 * (decimal)SofaPrice, item.LineTotal);
    }

    [Fact]
    public async Task GetOrder_OtherUsersOrder_Returns404()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);
        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder());

        Assert.IsType<NotFoundResult>((await OrdersFor(test.Db, UserB).GetOrder(order.Id)).Result);
        Assert.IsType<NotFoundResult>((await OrdersFor(test.Db, UserA).GetOrder(Guid.NewGuid())).Result);
    }

    [Fact]
    public async Task UnauthenticatedAccess_IsRejected()
    {
        using var test = new TestDb();

        Assert.IsType<UnauthorizedResult>((await OrdersFor(test.Db, null).GetOrders()).Result);
        Assert.IsType<UnauthorizedResult>((await OrdersFor(test.Db, null).GetOrder(Guid.NewGuid())).Result);
        Assert.IsType<UnauthorizedResult>((await OrdersFor(test.Db, null).CreateOrder()).Result);
    }
}
