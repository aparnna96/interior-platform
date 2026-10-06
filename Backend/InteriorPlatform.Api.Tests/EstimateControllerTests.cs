using InteriorPlatform.Api.Configuration;
using InteriorPlatform.Api.Controllers;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Reflection;
using System.Security.Claims;
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Estimate rules (Task 11). SQLite in-memory is used for relational
/// fidelity. These tests never touch the real SQL Server database.
/// </summary>
public sealed class EstimateControllerTests
{
    private const string UserA = "user-a";
    private const string UserB = "user-b";

    // Deliberately different from any documented default: proves the server
    // uses the configured rate instead of a hard-coded business rule.
    private const decimal TestRate = 2000m;

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
            Db.SaveChanges();
        }

        public void Dispose()
        {
            Db.Dispose();
            _connection.Dispose();
        }
    }

    private static EstimatesController ControllerFor(
        ApplicationDbContext db, string? userId, decimal rate = TestRate)
    {
        var controller = new EstimatesController(
            db, Options.Create(new EstimateOptions { DemoRatePerSquareFoot = rate }));
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

    private static EstimateResponse CreatedEstimate(ActionResult<EstimateResponse> result)
    {
        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(StatusCodes.Status201Created, created.StatusCode);
        return Assert.IsType<EstimateResponse>(created.Value);
    }

    private static void BadRequest(ActionResult<EstimateResponse> result)
    {
        var bad = Assert.IsType<ObjectResult>(result.Result);
        Assert.True(
            bad.StatusCode == StatusCodes.Status400BadRequest ||
            (bad.StatusCode is null && bad.Value is ValidationProblemDetails),
            $"Expected 400, got {bad.StatusCode}.");
    }

    [Fact]
    public void EstimatesController_RequiresAuthorization()
    {
        Assert.True(typeof(EstimatesController).GetCustomAttributes(
            typeof(AuthorizeAttribute), inherit: true).Any());
    }

    [Fact]
    public void CreateEstimateRequest_ExposesOnlyDimensionsAndFurnitureLines()
    {
        // The client must have nowhere to put ownership, money or timestamps;
        // furniture lines carry only a type key and a quantity.
        var names = typeof(CreateEstimateRequest)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .OrderBy(n => n)
            .ToList();
        Assert.Equal(["Items", "Length", "Width"], names);
    }

    [Fact]
    public async Task CreateEstimate_ComputesAreaAndAmountFromConfiguredRate()
    {
        using var test = new TestDb();

        var response = CreatedEstimate(await ControllerFor(test.Db, UserA)
            .CreateEstimate(new CreateEstimateRequest { Width = 12m, Length = 15m }));

        Assert.Equal(12m, response.Width);
        Assert.Equal(15m, response.Length);
        Assert.Equal(180m, response.Area);
        Assert.Equal(TestRate, response.RatePerSquareFoot);
        Assert.Equal(180m * TestRate, response.EstimatedAmount);

        var stored = await test.Db.Estimates.SingleAsync();
        Assert.Equal(UserA, stored.UserId);
        Assert.Equal(180m, stored.Area);
        Assert.Equal(180m * TestRate, stored.EstimatedAmount);
        Assert.NotEqual(default, stored.CreatedAt);
    }

    [Fact]
    public void EstimateItemRequest_ExposesOnlyTypeAndQuantity()
    {
        var names = typeof(EstimateItemRequest)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .OrderBy(n => n)
            .ToList();
        Assert.Equal(["FurnitureType", "Quantity"], names);
    }

    [Fact]
    public async Task CreateEstimate_SavesVisualizerFurniture_WithServerNamesAndFootprints()
    {
        using var test = new TestDb();

        var response = CreatedEstimate(await ControllerFor(test.Db, UserA).CreateEstimate(
            new CreateEstimateRequest
            {
                Width = 12m,
                Length = 15m,
                Items =
                [
                    new EstimateItemRequest { FurnitureType = "sofa", Quantity = 1 },
                    new EstimateItemRequest { FurnitureType = "Chair", Quantity = 4 },
                ],
            }));

        Assert.Equal(2, response.Items.Count);
        var sofa = Assert.Single(response.Items, i => i.FurnitureType == "sofa");
        Assert.Equal("Sofa", sofa.Name);
        Assert.Equal(7m, sofa.WidthFt);
        Assert.Equal(3m, sofa.LengthFt);
        var chair = Assert.Single(response.Items, i => i.FurnitureType == "chair");
        Assert.Equal(4, chair.Quantity);

        // Furniture does not change the money: the amount stays area-based.
        Assert.Equal(180m * TestRate, response.EstimatedAmount);
        Assert.Equal(2, await test.Db.EstimateItems.CountAsync());
    }

    [Fact]
    public async Task CreateEstimate_MergesRepeatedFurnitureTypes()
    {
        using var test = new TestDb();

        var response = CreatedEstimate(await ControllerFor(test.Db, UserA).CreateEstimate(
            new CreateEstimateRequest
            {
                Width = 10m,
                Length = 10m,
                Items =
                [
                    new EstimateItemRequest { FurnitureType = "chair", Quantity = 2 },
                    new EstimateItemRequest { FurnitureType = "chair", Quantity = 3 },
                ],
            }));

        var chair = Assert.Single(response.Items);
        Assert.Equal(5, chair.Quantity);
    }

    [Fact]
    public async Task CreateEstimate_RejectsUnknownFurnitureAndBadQuantities()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        BadRequest(await controller.CreateEstimate(new CreateEstimateRequest
        {
            Width = 10m, Length = 10m,
            Items = [new EstimateItemRequest { FurnitureType = "spaceship", Quantity = 1 }],
        }));
        BadRequest(await controller.CreateEstimate(new CreateEstimateRequest
        {
            Width = 10m, Length = 10m,
            Items = [new EstimateItemRequest { FurnitureType = "sofa", Quantity = 0 }],
        }));
        BadRequest(await controller.CreateEstimate(new CreateEstimateRequest
        {
            Width = 10m, Length = 10m,
            Items = [new EstimateItemRequest { FurnitureType = "sofa", Quantity = 100 }],
        }));
        BadRequest(await controller.CreateEstimate(new CreateEstimateRequest
        {
            Width = 10m, Length = 10m,
            Items =
            [
                new EstimateItemRequest { FurnitureType = "sofa", Quantity = 60 },
                new EstimateItemRequest { FurnitureType = "sofa", Quantity = 60 },
            ],
        }));

        Assert.Equal(0, await test.Db.Estimates.CountAsync());
        Assert.Equal(0, await test.Db.EstimateItems.CountAsync());
    }

    [Fact]
    public async Task GetEstimate_ReturnsFurnitureOnlyForOwner()
    {
        using var test = new TestDb();
        var created = CreatedEstimate(await ControllerFor(test.Db, UserA).CreateEstimate(
            new CreateEstimateRequest
            {
                Width = 12m,
                Length = 15m,
                Items = [new EstimateItemRequest { FurnitureType = "bed", Quantity = 1 }],
            }));

        var own = Assert.IsType<EstimateResponse>(Assert.IsType<OkObjectResult>(
            (await ControllerFor(test.Db, UserA).GetEstimate(created.Id)).Result).Value);
        Assert.Equal("Bed", Assert.Single(own.Items).Name);

        var list = Assert.IsType<List<EstimateResponse>>(Assert.IsType<OkObjectResult>(
            (await ControllerFor(test.Db, UserA).GetEstimates()).Result).Value);
        Assert.Single(Assert.Single(list).Items);

        Assert.IsType<NotFoundResult>(
            (await ControllerFor(test.Db, UserB).GetEstimate(created.Id)).Result);
    }

    [Fact]
    public async Task CreateEstimate_DerivesOwnershipFromClaims()
    {
        using var test = new TestDb();

        CreatedEstimate(await ControllerFor(test.Db, UserB)
            .CreateEstimate(new CreateEstimateRequest { Width = 10m, Length = 10m }));

        Assert.Equal([UserB], await test.Db.Estimates.Select(e => e.UserId).ToListAsync());
    }

    [Fact]
    public async Task CreateEstimate_RejectsZeroAndNegativeDimensions()
    {
        using var test = new TestDb();
        var controller = ControllerFor(test.Db, UserA);

        BadRequest(await controller.CreateEstimate(new CreateEstimateRequest { Width = 0m, Length = 10m }));
        BadRequest(await controller.CreateEstimate(new CreateEstimateRequest { Width = 10m, Length = 0m }));
        BadRequest(await controller.CreateEstimate(new CreateEstimateRequest { Width = -12m, Length = 15m }));
        BadRequest(await controller.CreateEstimate(new CreateEstimateRequest { Width = 12m, Length = -15m }));

        Assert.Equal(0, await test.Db.Estimates.CountAsync());
    }

    [Fact]
    public async Task CreateEstimate_RejectsAbsurdDimensions()
    {
        using var test = new TestDb();

        BadRequest(await ControllerFor(test.Db, UserA)
            .CreateEstimate(new CreateEstimateRequest { Width = 100000m, Length = 10m }));

        Assert.Equal(0, await test.Db.Estimates.CountAsync());
    }

    [Fact]
    public async Task GetEstimates_ReturnsOnlyOwnEstimatesNewestFirst()
    {
        using var test = new TestDb();
        var older = CreatedEstimate(await ControllerFor(test.Db, UserA)
            .CreateEstimate(new CreateEstimateRequest { Width = 10m, Length = 10m }));
        await Task.Delay(20);
        var newer = CreatedEstimate(await ControllerFor(test.Db, UserA)
            .CreateEstimate(new CreateEstimateRequest { Width = 12m, Length = 12m }));
        CreatedEstimate(await ControllerFor(test.Db, UserB)
            .CreateEstimate(new CreateEstimateRequest { Width = 9m, Length = 9m }));

        var result = await ControllerFor(test.Db, UserA).GetEstimates();
        var list = Assert.IsType<List<EstimateResponse>>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(2, list.Count);
        Assert.Equal(newer.Id, list[0].Id);
        Assert.Equal(older.Id, list[1].Id);
        Assert.True(list[0].CreatedAt >= list[1].CreatedAt);
        Assert.All(list, e => Assert.Equal(e.Area * TestRate, e.EstimatedAmount));
    }

    [Fact]
    public async Task GetEstimate_ReturnsOwnEstimate()
    {
        using var test = new TestDb();
        var created = CreatedEstimate(await ControllerFor(test.Db, UserA)
            .CreateEstimate(new CreateEstimateRequest { Width = 12m, Length = 15m }));

        var result = await ControllerFor(test.Db, UserA).GetEstimate(created.Id);
        var detail = Assert.IsType<EstimateResponse>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(created.Id, detail.Id);
        Assert.Equal(12m, detail.Width);
        Assert.Equal(15m, detail.Length);
        Assert.Equal(180m, detail.Area);
        Assert.Equal(TestRate, detail.RatePerSquareFoot);
        Assert.Equal(180m * TestRate, detail.EstimatedAmount);
    }

    [Fact]
    public async Task GetEstimate_OtherUsersEstimate_Returns404()
    {
        using var test = new TestDb();
        var created = CreatedEstimate(await ControllerFor(test.Db, UserA)
            .CreateEstimate(new CreateEstimateRequest { Width = 12m, Length = 15m }));

        Assert.IsType<NotFoundResult>(
            (await ControllerFor(test.Db, UserB).GetEstimate(created.Id)).Result);
    }

    [Fact]
    public async Task GetEstimate_MissingEstimate_Returns404()
    {
        using var test = new TestDb();

        Assert.IsType<NotFoundResult>(
            (await ControllerFor(test.Db, UserA).GetEstimate(Guid.NewGuid())).Result);
    }

    [Fact]
    public async Task UnauthenticatedAccess_IsRejected()
    {
        using var test = new TestDb();

        Assert.IsType<UnauthorizedResult>(
            (await ControllerFor(test.Db, null)
                .CreateEstimate(new CreateEstimateRequest { Width = 10m, Length = 10m })).Result);
        Assert.IsType<UnauthorizedResult>(
            (await ControllerFor(test.Db, null).GetEstimates()).Result);
        Assert.IsType<UnauthorizedResult>(
            (await ControllerFor(test.Db, null).GetEstimate(Guid.NewGuid())).Result);
        Assert.Equal(0, await test.Db.Estimates.CountAsync());
    }
}
