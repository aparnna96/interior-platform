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

    private static CreateOrderRequest ValidDelivery() => new()
    {
        FullName = "Asha Menon",
        Phone = "9876543210",
        AddressLine1 = "12 MG Road",
        AddressLine2 = "Near City Mall",
        City = "Kochi",
        State = "Kerala",
        Pincode = "682016",
        DeliveryNotes = "Call before delivery.",
    };

    private static CreateOrderRequest Delivery(Action<CreateOrderRequest> change)
    {
        var request = ValidDelivery();
        change(request);
        return request;
    }

    /// <summary>Asserts a 400 whose ModelState names the given request property.</summary>
    private static void BadRequestOn(ActionResult<OrderDetailResponse> result, string property)
    {
        var bad = Assert.IsType<ObjectResult>(result.Result);
        Assert.True(
            bad.StatusCode == StatusCodes.Status400BadRequest ||
            (bad.StatusCode is null && bad.Value is ValidationProblemDetails),
            $"Expected 400, got {bad.StatusCode}.");
        var problem = Assert.IsType<ValidationProblemDetails>(bad.Value);
        Assert.Contains(property, problem.Errors.Keys);
    }
    [Fact]
    public void OrdersController_RequiresAuthorization()
    {
        Assert.True(typeof(OrdersController).GetCustomAttributes(
            typeof(AuthorizeAttribute), inherit: true).Any());
    }

    [Fact]
    public void CreateOrder_BodyCarriesOnlyDeliveryDetails_ClientCannotInfluencePriceOrStatus()
    {
        // The only thing bound from the request is the delivery details: no
        // prices, totals, product names, user ids or status can reach the server.
        var method = typeof(OrdersController).GetMethod(
            nameof(OrdersController.CreateOrder),
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);
        var parameter = Assert.Single(method.GetParameters());
        Assert.Equal(typeof(CreateOrderRequest), parameter.ParameterType);

        var names = typeof(CreateOrderRequest).GetProperties().Select(p => p.Name).OrderBy(n => n).ToArray();
        Assert.Equal(
            new[]
            {
                "AddressLine1", "AddressLine2", "City", "DeliveryNotes",
                "FullName", "Phone", "Pincode", "State",
            },
            names);
    }

    [Fact]
    public async Task CreateOrder_FromCart_CreatesPendingOrderWithSnapshotsAndTotals()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 2);
        await AddToCart(test.Db, UserA, ChairId, 1);

        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

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

        CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

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
        BadRequest(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

        // Existing but empty cart.
        var cartResult = await CartFor(test.Db, UserA).GetCart();
        Assert.IsType<OkObjectResult>(cartResult.Result);
        BadRequest(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

        Assert.Equal(0, await test.Db.Orders.CountAsync());
    }

    [Fact]
    public async Task CreateOrder_InactiveProduct_Returns400WithoutPartialState()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        test.Db.Products.Single(p => p.Id == SofaId).IsActive = false;
        await test.Db.SaveChangesAsync();

        BadRequest(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

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

        BadRequest(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

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

        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));
        Assert.Equal(2 * (decimal)newPrice, order.Subtotal);
        Assert.Equal(2 * (decimal)newPrice, Assert.Single(order.Items).LineTotal);
    }

    [Fact]
    public async Task OrderHistory_SurvivesProductChanges()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);
        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

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
        var first = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

        await AddToCart(test.Db, UserB, ChairId, 1);
        CreatedOrder(await OrdersFor(test.Db, UserB).CreateOrder(ValidDelivery()));

        await AddToCart(test.Db, UserA, ChairId, 2);
        var second = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

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
        var created = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

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
        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

        Assert.IsType<NotFoundResult>((await OrdersFor(test.Db, UserB).GetOrder(order.Id)).Result);
        Assert.IsType<NotFoundResult>((await OrdersFor(test.Db, UserA).GetOrder(Guid.NewGuid())).Result);
    }

    [Fact]
    public async Task UnauthenticatedAccess_IsRejected()
    {
        using var test = new TestDb();

        Assert.IsType<UnauthorizedResult>((await OrdersFor(test.Db, null).GetOrders()).Result);
        Assert.IsType<UnauthorizedResult>((await OrdersFor(test.Db, null).GetOrder(Guid.NewGuid())).Result);
        Assert.IsType<UnauthorizedResult>((await OrdersFor(test.Db, null).CreateOrder(ValidDelivery())).Result);
    }

    // ---------------------------------------------------------------- delivery details

    [Fact]
    public async Task CreateOrder_ValidDelivery_IsStoredOnTheOrderAndReturned()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

        var d = Assert.IsType<DeliveryDetailsResponse>(order.Delivery);
        Assert.Equal("Asha Menon", d.FullName);
        Assert.Equal("9876543210", d.Phone);
        Assert.Equal("12 MG Road", d.AddressLine1);
        Assert.Equal("Near City Mall", d.AddressLine2);
        Assert.Equal("Kochi", d.City);
        Assert.Equal("Kerala", d.State);
        Assert.Equal("682016", d.Pincode);
        Assert.Equal("Call before delivery.", d.DeliveryNotes);

        // And it really is persisted on the Order row.
        var stored = await test.Db.Orders.AsNoTracking().SingleAsync(o => o.Id == order.Id);
        Assert.Equal("Asha Menon", stored.DeliveryFullName);
        Assert.Equal("9876543210", stored.DeliveryPhone);
        Assert.Equal("12 MG Road", stored.DeliveryAddressLine1);
        Assert.Equal("Near City Mall", stored.DeliveryAddressLine2);
        Assert.Equal("Kochi", stored.DeliveryCity);
        Assert.Equal("Kerala", stored.DeliveryState);
        Assert.Equal("682016", stored.DeliveryPincode);
        Assert.Equal("Call before delivery.", stored.DeliveryNotes);
        Assert.Equal(OrderStatus.Pending, stored.Status);
    }

    [Fact]
    public async Task CreateOrder_OptionalFieldsMayBeOmittedOrBlank()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        var request = Delivery(r => { r.AddressLine2 = null; r.DeliveryNotes = "   "; });
        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(request));

        Assert.Null(order.Delivery!.AddressLine2);
        Assert.Null(order.Delivery.DeliveryNotes);
    }

    [Fact]
    public async Task CreateOrder_TrimsEveryField()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        var request = new CreateOrderRequest
        {
            FullName = "  Asha Menon  ",
            Phone = "  9876543210 ",
            AddressLine1 = "\t12 MG Road\n",
            AddressLine2 = " Near City Mall ",
            City = " Kochi ",
            State = " Kerala ",
            Pincode = " 682016 ",
            DeliveryNotes = "  Call first.  ",
        };
        var d = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(request)).Delivery!;

        Assert.Equal("Asha Menon", d.FullName);
        Assert.Equal("9876543210", d.Phone);
        Assert.Equal("12 MG Road", d.AddressLine1);
        Assert.Equal("Near City Mall", d.AddressLine2);
        Assert.Equal("Kochi", d.City);
        Assert.Equal("Kerala", d.State);
        Assert.Equal("682016", d.Pincode);
        Assert.Equal("Call first.", d.DeliveryNotes);
    }

    [Theory]
    [InlineData("FullName")]
    [InlineData("Phone")]
    [InlineData("AddressLine1")]
    [InlineData("City")]
    [InlineData("State")]
    [InlineData("Pincode")]
    public async Task CreateOrder_RequiredField_MissingEmptyOrBlank_Returns400(string property)
    {
        foreach (var bad in new string?[] { null, string.Empty, "   ", "\t\n" })
        {
            using var test = new TestDb();
            await AddToCart(test.Db, UserA, SofaId, 1);

            var request = Delivery(r => typeof(CreateOrderRequest).GetProperty(property)!.SetValue(r, bad));
            BadRequestOn(await OrdersFor(test.Db, UserA).CreateOrder(request), property);

            // Nothing was created and the cart is untouched.
            Assert.Equal(0, await test.Db.Orders.CountAsync());
            Assert.Equal(1, await test.Db.CartItems.CountAsync());
        }
    }

    [Theory]
    [InlineData("FullName", 1, true)]
    [InlineData("FullName", 2, false)]
    [InlineData("FullName", 100, false)]
    [InlineData("FullName", 101, true)]
    [InlineData("AddressLine1", 200, false)]
    [InlineData("AddressLine1", 201, true)]
    [InlineData("AddressLine2", 200, false)]
    [InlineData("AddressLine2", 201, true)]
    [InlineData("City", 100, false)]
    [InlineData("City", 101, true)]
    [InlineData("State", 100, false)]
    [InlineData("State", 101, true)]
    [InlineData("DeliveryNotes", 500, false)]
    [InlineData("DeliveryNotes", 501, true)]
    public async Task CreateOrder_TextLengths_AreEnforced(string property, int length, bool rejected)
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        var request = Delivery(r => typeof(CreateOrderRequest).GetProperty(property)!.SetValue(r, new string('a', length)));
        var result = await OrdersFor(test.Db, UserA).CreateOrder(request);

        if (rejected)
        {
            BadRequestOn(result, property);
            Assert.Equal(0, await test.Db.Orders.CountAsync());
        }
        else
        {
            CreatedOrder(result);
        }
    }

    [Fact]
    public async Task CreateOrder_LengthsAreMeasuredAfterTrimming()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        // 100 letters plus padding is exactly at the limit once trimmed.
        var request = Delivery(r => r.FullName = "  " + new string('a', 100) + "  ");
        Assert.Equal(100, CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(request)).Delivery!.FullName.Length);
    }

    [Theory]
    [InlineData("9876543210", "9876543210")]
    [InlineData("+919876543210", "9876543210")]
    [InlineData("+91 98765 43210", "9876543210")]
    [InlineData("98765-43210", "9876543210")]
    [InlineData(" 6123456789 ", "6123456789")]
    public async Task CreateOrder_ValidPhoneFormats_AreNormalisedToTenDigits(string input, string expected)
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(Delivery(r => r.Phone = input)));
        Assert.Equal(expected, order.Delivery!.Phone);
        Assert.Equal(expected, (await test.Db.Orders.AsNoTracking().SingleAsync()).DeliveryPhone);
    }

    [Theory]
    [InlineData("987654321")]        // 9 digits
    [InlineData("98765432101")]      // 11 digits
    [InlineData("+91987654321")]     // 9 digits after the prefix
    [InlineData("+9198765432101")]   // 11 digits after the prefix
    [InlineData("98765abcde")]
    [InlineData("98765 4321x")]
    [InlineData("+1 9876543210")]    // not an Indian prefix
    [InlineData("++919876543210")]
    [InlineData("(98765) 43210")]
    [InlineData("phone")]
    public async Task CreateOrder_InvalidPhone_Returns400(string input)
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        BadRequestOn(await OrdersFor(test.Db, UserA).CreateOrder(Delivery(r => r.Phone = input)), "Phone");
        Assert.Equal(0, await test.Db.Orders.CountAsync());
    }

    [Theory]
    [InlineData("682016")]
    [InlineData("000000")]
    [InlineData(" 682016 ")]
    public async Task CreateOrder_ValidPincode_IsAccepted(string input)
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(Delivery(r => r.Pincode = input)));
        Assert.Equal(input.Trim(), order.Delivery!.Pincode);
    }

    [Theory]
    [InlineData("68201")]      // 5 digits
    [InlineData("6820161")]    // 7 digits
    [InlineData("68201a")]
    [InlineData("682 016")]
    [InlineData("-82016")]
    [InlineData("pincode")]
    public async Task CreateOrder_InvalidPincode_Returns400(string input)
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        BadRequestOn(await OrdersFor(test.Db, UserA).CreateOrder(Delivery(r => r.Pincode = input)), "Pincode");
        Assert.Equal(0, await test.Db.Orders.CountAsync());
    }

    [Fact]
    public async Task CreateOrder_MultipleBadFields_ReportsEachOne()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        var request = Delivery(r => { r.FullName = ""; r.Phone = "123"; r.Pincode = "1"; r.City = null; });
        var bad = Assert.IsType<ObjectResult>((await OrdersFor(test.Db, UserA).CreateOrder(request)).Result);
        var errors = Assert.IsType<ValidationProblemDetails>(bad.Value).Errors.Keys;

        Assert.Contains("FullName", errors);
        Assert.Contains("Phone", errors);
        Assert.Contains("Pincode", errors);
        Assert.Contains("City", errors);
    }

    [Fact]
    public async Task CreateOrder_NullBody_Returns400()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        BadRequestOn(await OrdersFor(test.Db, UserA).CreateOrder(null), "Delivery");
        Assert.Equal(0, await test.Db.Orders.CountAsync());
        Assert.Equal(1, await test.Db.CartItems.CountAsync());
    }

    [Fact]
    public async Task CreateOrder_EmptyObjectBody_IsRejectedWithEveryRequiredField()
    {
        // The old client sent "{}". That must now fail, naming each required field.
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);

        var bad = Assert.IsType<ObjectResult>((await OrdersFor(test.Db, UserA).CreateOrder(new CreateOrderRequest())).Result);
        var errors = Assert.IsType<ValidationProblemDetails>(bad.Value).Errors.Keys;
        foreach (var required in new[] { "FullName", "Phone", "AddressLine1", "City", "State", "Pincode" })
        {
            Assert.Contains(required, errors);
        }

        Assert.DoesNotContain("AddressLine2", errors);
        Assert.DoesNotContain("DeliveryNotes", errors);
        Assert.Equal(0, await test.Db.Orders.CountAsync());
        Assert.Equal(1, await test.Db.CartItems.CountAsync());
    }

    [Fact]
    public async Task CreateOrder_EmptyCart_WithValidDelivery_Returns400()
    {
        using var test = new TestDb();

        BadRequestOn(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()), "Cart");
        Assert.Equal(0, await test.Db.Orders.CountAsync());
    }

    [Fact]
    public async Task CreateOrder_InvalidDelivery_DoesNotClearTheCart()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 2);

        BadRequestOn(await OrdersFor(test.Db, UserA).CreateOrder(Delivery(r => r.Pincode = "1")), "Pincode");

        Assert.Equal(2, (await test.Db.CartItems.SingleAsync()).Quantity);
        Assert.Equal(0, await test.Db.Orders.CountAsync());
    }

    [Fact]
    public async Task CreateOrder_DeliveryDoesNotChangePricingOrStatus()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 2);

        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

        Assert.Equal(OrderStatus.Pending, order.Status);
        Assert.Equal(2 * (decimal)SofaPrice, order.Subtotal);
        Assert.Equal(0, await test.Db.CartItems.CountAsync());
        Assert.True(await test.Db.Carts.AnyAsync(c => c.UserId == UserA));
    }

    [Fact]
    public async Task GetOrder_OwnOrder_ReturnsTheStoredDelivery()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);
        var created = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

        var result = await OrdersFor(test.Db, UserA).GetOrder(created.Id);
        var detail = Assert.IsType<OrderDetailResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal("Asha Menon", detail.Delivery!.FullName);
        Assert.Equal("682016", detail.Delivery.Pincode);
        Assert.Equal("Call before delivery.", detail.Delivery.DeliveryNotes);
    }

    [Fact]
    public async Task GetOrder_OtherCustomerCannotReadTheDelivery()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);
        var order = CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

        // Another customer gets a plain 404: no order, so no address either.
        Assert.IsType<NotFoundResult>((await OrdersFor(test.Db, UserB).GetOrder(order.Id)).Result);
    }

    [Fact]
    public async Task OrderList_StillOmitsDeliveryDetails()
    {
        using var test = new TestDb();
        await AddToCart(test.Db, UserA, SofaId, 1);
        CreatedOrder(await OrdersFor(test.Db, UserA).CreateOrder(ValidDelivery()));

        var list = Assert.IsType<List<OrderResponse>>(
            Assert.IsType<OkObjectResult>((await OrdersFor(test.Db, UserA).GetOrders()).Result).Value);
        Assert.Single(list);
        Assert.Equal(
            new[] { "CreatedAt", "Id", "ItemCount", "Status", "Subtotal" },
            typeof(OrderResponse).GetProperties().Select(p => p.Name).OrderBy(n => n).ToArray());
    }

    [Fact]
    public async Task OrderCreatedBeforeCheckout_HasNullDelivery()
    {
        using var test = new TestDb();
        var now = DateTime.UtcNow;
        test.Db.Orders.Add(new Order
        {
            Id = Guid.NewGuid(),
            UserId = UserA,
            Status = OrderStatus.Pending,
            CreatedAt = now,
            UpdatedAt = now,
            Subtotal = 100m,
        });
        await test.Db.SaveChangesAsync();
        var id = (await test.Db.Orders.AsNoTracking().SingleAsync()).Id;

        var detail = Assert.IsType<OrderDetailResponse>(
            Assert.IsType<OkObjectResult>((await OrdersFor(test.Db, UserA).GetOrder(id)).Result).Value);
        Assert.Null(detail.Delivery);
    }}
