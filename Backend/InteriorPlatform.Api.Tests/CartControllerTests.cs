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
/// Cart rules (Task 5). SQLite in-memory is used for relational fidelity
/// (FKs, unique index). These tests never touch the real SQL Server database.
/// </summary>
public sealed class CartControllerTests
{
    private const string UserA = "user-a";
    private const string UserB = "user-b";
    private const string ActiveProductId = "aria-3s-sofa";
    private const string InactiveProductId = "retired-chair";
    private const int ActivePrice = 42999;

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
                TestProduct(ActiveProductId, isActive: true, price: ActivePrice),
                TestProduct(InactiveProductId, isActive: false, price: 9999));
            Db.SaveChanges();
        }

        public void Dispose()
        {
            Db.Dispose();
            _connection.Dispose();
        }
    }

    private static Product TestProduct(string id, bool isActive, int price) => new()
    {
        Id = id,
        Name = $"{id} name",
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
        IsActive = isActive,
    };

    private static CartController ControllerFor(ApplicationDbContext db, string? userId)
    {
        var controller = new CartController(db);
        ClaimsPrincipal principal = userId is null
            ? new ClaimsPrincipal(new ClaimsIdentity())
            : new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId)], "Test"));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = principal },
        };
        return controller;
    }

    private static CartResponse OkCart(ActionResult<CartResponse> result)
    {
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        return Assert.IsType<CartResponse>(ok.Value);
    }

    private static void BadRequest(ActionResult<CartResponse> result)
    {
        // Direct controller calls bypass model-binding validation, so the
        // explicit in-action checks produce ValidationProblem(): an
        // ObjectResult carrying ValidationProblemDetails (StatusCode is
        // applied as 400 by the HTTP pipeline from the problem details).
        var bad = Assert.IsType<ObjectResult>(result.Result);
        Assert.True(
            bad.StatusCode == StatusCodes.Status400BadRequest ||
            (bad.StatusCode is null && bad.Value is ValidationProblemDetails),
            $"Expected 400, got {bad.StatusCode}.");
    }

    [Fact]
    public void CartController_RequiresAuthorization()
    {
        Assert.True(typeof(CartController).GetCustomAttributes(
            typeof(AuthorizeAttribute), inherit: true).Any());
    }

    [Fact]
    public async Task GetCart_AuthenticatedUser_GetsEmptyCart()
    {
        using var test = new TestDb();
        var cart = OkCart(await ControllerFor(test.Db, UserA).GetCart());
        Assert.Empty(cart.Items);
        Assert.Equal(0, cart.ItemCount);
        Assert.Equal(0, cart.Subtotal);
    }

    [Fact]
    public async Task AddItem_ActiveProduct_CreatesCartItemWithServerTotals()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        var cart = OkCart(await controller.AddItem(new AddCartItemRequest
        {
            ProductId = ActiveProductId,
            Quantity = 2,
        }));

        var item = Assert.Single(cart.Items);
        Assert.Equal(ActiveProductId, item.ProductId);
        Assert.Equal(ActiveProductId, item.Slug);
        Assert.Equal(2, item.Quantity);
        Assert.Equal(ActivePrice, item.Price);
        Assert.Equal(2 * ActivePrice, item.LineTotal);
        Assert.True(item.IsAvailable);
        Assert.Equal(2, cart.ItemCount);
        Assert.Equal(2 * ActivePrice, cart.Subtotal);
    }

    [Fact]
    public async Task AddItem_SameProduct_IncreasesQuantityInsteadOfDuplicating()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        await controller.AddItem(new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 2 });
        var cart = OkCart(await controller.AddItem(new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 3 }));

        var item = Assert.Single(cart.Items);
        Assert.Equal(5, item.Quantity);
        Assert.Equal(5 * ActivePrice, item.LineTotal);
        Assert.Equal(5, cart.ItemCount);
    }

    [Fact]
    public async Task AddItem_QuantityAbove99_IsRejected()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        BadRequest(await controller.AddItem(new AddCartItemRequest
        {
            ProductId = ActiveProductId,
            Quantity = 100,
        }));
        Assert.Empty(OkCart(await controller.GetCart()).Items);
    }

    [Fact]
    public async Task AddItem_MergedQuantityAbove99_IsRejectedAndKeepsExisting()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        OkCart(await controller.AddItem(new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 60 }));
        BadRequest(await controller.AddItem(new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 60 }));

        var item = Assert.Single(OkCart(await controller.GetCart()).Items);
        Assert.Equal(60, item.Quantity);
    }

    [Fact]
    public async Task AddItem_InactiveProduct_ReturnsNotFound()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        var result = await controller.AddItem(new AddCartItemRequest
        {
            ProductId = InactiveProductId,
            Quantity = 1,
        });

        Assert.IsType<NotFoundResult>(result.Result);
        Assert.Empty(OkCart(await controller.GetCart()).Items);
    }

    [Fact]
    public async Task AddItem_MissingProduct_ReturnsNotFound()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        var result = await controller.AddItem(new AddCartItemRequest
        {
            ProductId = "no-such-product",
            Quantity = 1,
        });

        Assert.IsType<NotFoundResult>(result.Result);
    }

    [Fact]
    public async Task GetCart_ProductDeactivatedLater_KeepsItemMarkedUnavailable()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        OkCart(await controller.AddItem(new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 1 }));

        test.Db.Products.Single(p => p.Id == ActiveProductId).IsActive = false;
        await test.Db.SaveChangesAsync();

        var item = Assert.Single(OkCart(await controller.GetCart()).Items);
        Assert.False(item.IsAvailable);
    }

    [Fact]
    public async Task GetCart_UsesCurrentProductPrice()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        OkCart(await controller.AddItem(new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 2 }));

        const int newPrice = ActivePrice + 1000;
        test.Db.Products.Single(p => p.Id == ActiveProductId).Price = newPrice;
        await test.Db.SaveChangesAsync();

        var cart = OkCart(await controller.GetCart());
        Assert.Equal(2 * newPrice, cart.Subtotal);
        Assert.Equal(2 * newPrice, Assert.Single(cart.Items).LineTotal);
    }

    [Fact]
    public async Task UpdateItem_OwnItem_SetsQuantity()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        var itemId = Assert.Single(OkCart(
            await controller.AddItem(new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 1 })).Items).Id;

        var cart = OkCart(await controller.UpdateItem(itemId, new UpdateCartItemRequest { Quantity = 4 }));
        Assert.Equal(4, Assert.Single(cart.Items).Quantity);
        Assert.Equal(4 * ActivePrice, cart.Subtotal);
    }

    [Fact]
    public async Task UpdateItem_InvalidQuantity_IsRejected()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        var itemId = Assert.Single(OkCart(
            await controller.AddItem(new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 1 })).Items).Id;

        BadRequest(await controller.UpdateItem(itemId, new UpdateCartItemRequest { Quantity = 0 }));
        BadRequest(await controller.UpdateItem(itemId, new UpdateCartItemRequest { Quantity = 100 }));
        Assert.Equal(1, Assert.Single(OkCart(await controller.GetCart()).Items).Quantity);
    }

    [Fact]
    public async Task UpdateItem_OtherUsersItem_ReturnsNotFoundAndLeavesItAlone()
    {
        using var test = new TestDb();

        var itemId = Assert.Single(OkCart(
            await ControllerFor(test.Db, UserA).AddItem(
                new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 1 })).Items).Id;

        var result = await ControllerFor(test.Db, UserB)
            .UpdateItem(itemId, new UpdateCartItemRequest { Quantity = 9 });

        Assert.IsType<NotFoundResult>(result.Result);
        Assert.Equal(1, Assert.Single(OkCart(
            await ControllerFor(test.Db, UserA).GetCart()).Items).Quantity);
    }

    [Fact]
    public async Task RemoveItem_OwnItem_Returns204AndRemovesIt()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        var itemId = Assert.Single(OkCart(
            await controller.AddItem(new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 1 })).Items).Id;

        Assert.IsType<NoContentResult>(await controller.RemoveItem(itemId));
        Assert.Empty(OkCart(await controller.GetCart()).Items);
    }

    [Fact]
    public async Task RemoveItem_OtherUsersItem_ReturnsNotFoundAndKeepsIt()
    {
        using var test = new TestDb();

        var itemId = Assert.Single(OkCart(
            await ControllerFor(test.Db, UserA).AddItem(
                new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 1 })).Items).Id;

        Assert.IsType<NotFoundResult>(await ControllerFor(test.Db, UserB).RemoveItem(itemId));
        Assert.Single(OkCart(await ControllerFor(test.Db, UserA).GetCart()).Items);
    }

    [Fact]
    public async Task RemoveItem_MissingItem_ReturnsNotFound()
    {
        using var test = new TestDb();
        Assert.IsType<NotFoundResult>(
            await ControllerFor(test.Db, UserA).RemoveItem(Guid.NewGuid()));
    }

    [Fact]
    public async Task Carts_AreIsolatedPerUser()
    {
        using var test = new TestDb();

        await ControllerFor(test.Db, UserA).AddItem(
            new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 2 });

        var cartB = OkCart(await ControllerFor(test.Db, UserB).GetCart());
        Assert.Empty(cartB.Items);

        var cartA = OkCart(await ControllerFor(test.Db, UserA).GetCart());
        Assert.Equal(2, cartA.ItemCount);
    }

    [Fact]
    public async Task UnauthenticatedAccess_IsRejected()
    {
        using var test = new TestDb();

        var anonymous = ControllerFor(test.Db, userId: null);
        Assert.IsType<UnauthorizedResult>((await anonymous.GetCart()).Result);
        Assert.IsType<UnauthorizedResult>((await anonymous.AddItem(
            new AddCartItemRequest { ProductId = ActiveProductId, Quantity = 1 })).Result);
        Assert.IsType<UnauthorizedResult>((await anonymous.UpdateItem(
            Guid.NewGuid(), new UpdateCartItemRequest { Quantity = 1 })).Result);
        Assert.IsType<UnauthorizedResult>(await anonymous.RemoveItem(Guid.NewGuid()));
    }
}
