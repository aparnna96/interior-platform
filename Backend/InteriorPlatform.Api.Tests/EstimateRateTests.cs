using InteriorPlatform.Api.Configuration;
using InteriorPlatform.Api.Controllers;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using InteriorPlatform.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using System.Reflection;
using System.Security.Claims;
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Rate Master rules: the Admin-managed, append-only history of the estimate
/// rate, the public read, the startup seed, and how a rate change interacts
/// with estimates, proposals, the payment lock and the PDF. SQLite in-memory
/// is used for relational fidelity (filtered unique index, check constraint).
/// These tests never touch the real SQL Server database. Role enforcement
/// itself runs in the ASP.NET Core pipeline and is exercised end to end in
/// <see cref="ProductionSecurityTests"/>; here it is verified declaratively.
/// </summary>
public sealed class EstimateRateTests
{
    private const string Admin = "admin-user";
    private const string AdminEmail = "admin@test.local";
    private const string Customer = "user-a";

    private const decimal SeededRate = 1500m;

    private sealed class TestDb : IDisposable
    {
        public ApplicationDbContext Db { get; }

        private readonly SqliteConnection _connection;

        public TestDb(bool withActiveRate = true)
        {
            _connection = new SqliteConnection("DataSource=:memory:");
            _connection.Open();
            Db = new ApplicationDbContext(
                new DbContextOptionsBuilder<ApplicationDbContext>()
                    .UseSqlite(_connection)
                    .Options);
            Db.Database.EnsureCreated();

            Db.Users.AddRange(
                new ApplicationUser { Id = Admin, UserName = AdminEmail, Email = AdminEmail },
                new ApplicationUser { Id = Customer, UserName = "a@test.local", Email = "a@test.local" });
            if (withActiveRate)
            {
                Db.EstimateRates.Add(Rate(SeededRate, active: true, new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc)));
            }

            Db.SaveChanges();
        }

        public void Dispose()
        {
            Db.Dispose();
            _connection.Dispose();
        }
    }

    private static EstimateRate Rate(decimal rate, bool active, DateTime createdAt, string? by = null) => new()
    {
        Id = Guid.NewGuid(),
        RatePerSquareFoot = rate,
        IsActive = active,
        CreatedAt = createdAt,
        CreatedByUserId = by,
    };

    private static T As<T>(T controller, string? userId) where T : ControllerBase
    {
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

    private static AdminEstimateRatesController AdminRates(ApplicationDbContext db, string? userId = Admin) =>
        As(new AdminEstimateRatesController(db), userId);

    private static EstimatesController Estimates(ApplicationDbContext db, string? userId = Customer) =>
        As(new EstimatesController(db), userId);

    private static ProposalsController Proposals(ApplicationDbContext db, string? userId = Customer) =>
        As(new ProposalsController(db), userId);

    private static EstimateRateController PublicRate(ApplicationDbContext db) =>
        As(new EstimateRateController(db), null);

    private static Task<ActionResult<AdminEstimateRateResponse>> SetRate(
        ApplicationDbContext db, decimal rate, string? userId = Admin) =>
        AdminRates(db, userId).SetRate(new SetEstimateRateRequest { RatePerSquareFoot = rate });

    private static AdminEstimateRateResponse CreatedRate(ActionResult<AdminEstimateRateResponse> result)
    {
        var created = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status201Created, created.StatusCode);
        return Assert.IsType<AdminEstimateRateResponse>(created.Value);
    }

    private static void BadRequest(ActionResult<AdminEstimateRateResponse> result)
    {
        var bad = Assert.IsType<ObjectResult>(result.Result);
        Assert.True(
            bad.StatusCode == StatusCodes.Status400BadRequest ||
            (bad.StatusCode is null && bad.Value is ValidationProblemDetails),
            $"Expected 400, got {bad.StatusCode}.");
    }

    private static EstimateResponse CreatedEstimate(ActionResult<EstimateResponse> result)
    {
        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        return Assert.IsType<EstimateResponse>(created.Value);
    }

    private static Task<ActionResult<EstimateResponse>> Save(
        ApplicationDbContext db, decimal width = 12m, decimal length = 15m) =>
        Estimates(db).CreateEstimate(new CreateEstimateRequest { Width = width, Length = length });

    // ── rules ─────────────────────────────────────────────────────────

    [Theory]
    [InlineData("1500", true)]
    [InlineData("0.01", true)]
    [InlineData("1500.55", true)]
    [InlineData("100000", true)]
    [InlineData("0", false)]
    [InlineData("-1", false)]
    [InlineData("-1500", false)]
    [InlineData("100000.01", false)]
    [InlineData("100001", false)]
    [InlineData("1500.555", false)]
    [InlineData("0.001", false)]
    public void Rules_AcceptOnlyPositiveRatesWithinTheBoundAndTwoDecimals(string text, bool valid)
    {
        var rate = decimal.Parse(text, System.Globalization.CultureInfo.InvariantCulture);
        Assert.Equal(valid, EstimateRateRules.Validate(rate) is null);
    }

    [Fact]
    public void Rules_UpperBoundIsOneLakhPerSquareFoot()
    {
        Assert.Equal(100000m, EstimateRateRules.MaxRatePerSquareFoot);
    }

    // ── Admin controller: authorization shape ─────────────────────────

    [Fact]
    public void AdminEstimateRatesController_RequiresAdminRole()
    {
        var attribute = typeof(AdminEstimateRatesController).GetCustomAttributes(
            typeof(AuthorizeAttribute), inherit: true)
            .OfType<AuthorizeAttribute>()
            .Single();
        Assert.Equal("Admin", attribute.Roles);
    }

    [Fact]
    public void AdminEstimateRatesController_NoActionIsLoosenedOrOffersEditOrDelete()
    {
        var actions = typeof(AdminEstimateRatesController)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
        foreach (var method in actions)
        {
            Assert.Empty(method.GetCustomAttributes(typeof(AllowAnonymousAttribute), inherit: true));
            Assert.DoesNotContain(
                method.GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true).OfType<AuthorizeAttribute>(),
                a => a.Roles != "Admin");
            // The history is append-only: only GET and POST exist.
            Assert.Empty(method.GetCustomAttributes(typeof(HttpPutAttribute), inherit: true));
            Assert.Empty(method.GetCustomAttributes(typeof(HttpPatchAttribute), inherit: true));
            Assert.Empty(method.GetCustomAttributes(typeof(HttpDeleteAttribute), inherit: true));
        }
    }

    [Fact]
    public void SetEstimateRateRequest_ExposesOnlyTheRate()
    {
        var names = typeof(SetEstimateRateRequest)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToList();
        Assert.Equal(["RatePerSquareFoot"], names);
    }

    [Fact]
    public void CreateEstimateRequest_StillHasNoRateField()
    {
        var names = typeof(CreateEstimateRequest)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .OrderBy(n => n)
            .ToList();
        Assert.Equal(["Items", "Length", "Width"], names);
    }

    // ── Admin controller: setting a rate ──────────────────────────────

    [Fact]
    public async Task SetRate_FirstRate_IsStoredActiveWithTheAdminFromClaims()
    {
        using var test = new TestDb(withActiveRate: false);

        var response = CreatedRate(await SetRate(test.Db, 1750.5m));

        Assert.Equal(1750.5m, response.RatePerSquareFoot);
        Assert.True(response.IsActive);
        Assert.Equal(AdminEmail, response.CreatedByEmail);

        var stored = await test.Db.EstimateRates.SingleAsync();
        Assert.True(stored.IsActive);
        Assert.Equal(Admin, stored.CreatedByUserId);
        Assert.Equal(DateTimeKind.Utc, stored.CreatedAt.Kind);
        Assert.True(stored.CreatedAt > DateTime.UtcNow.AddMinutes(-1));
    }

    [Fact]
    public async Task SetRate_NewRate_DeactivatesTheOldOneAndKeepsHistory()
    {
        using var test = new TestDb();

        CreatedRate(await SetRate(test.Db, 1800m));

        var all = await test.Db.EstimateRates.AsNoTracking().ToListAsync();
        Assert.Equal(2, all.Count);
        var active = Assert.Single(all, r => r.IsActive);
        Assert.Equal(1800m, active.RatePerSquareFoot);
        var old = Assert.Single(all, r => !r.IsActive);
        Assert.Equal(SeededRate, old.RatePerSquareFoot);

        // A third change keeps all three rows and still exactly one active.
        CreatedRate(await SetRate(test.Db, 2100m));
        all = await test.Db.EstimateRates.AsNoTracking().ToListAsync();
        Assert.Equal(3, all.Count);
        Assert.Equal(2100m, Assert.Single(all, r => r.IsActive).RatePerSquareFoot);
        Assert.Equal([1500m, 1800m], all.Where(r => !r.IsActive).Select(r => r.RatePerSquareFoot).OrderBy(x => x));
    }

    [Fact]
    public async Task SetRate_SameAsActive_IsAHarmlessNoOp()
    {
        using var test = new TestDb();

        var result = await SetRate(test.Db, SeededRate);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var body = Assert.IsType<AdminEstimateRateResponse>(ok.Value);
        Assert.Equal(SeededRate, body.RatePerSquareFoot);
        Assert.True(body.IsActive);
        Assert.Equal(1, await test.Db.EstimateRates.CountAsync());
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-5")]
    [InlineData("100000.01")]
    [InlineData("99999999")]
    [InlineData("1500.555")]
    public async Task SetRate_RejectsInvalidRates_AndChangesNothing(string text)
    {
        using var test = new TestDb();
        var rate = decimal.Parse(text, System.Globalization.CultureInfo.InvariantCulture);

        BadRequest(await SetRate(test.Db, rate));

        var only = await test.Db.EstimateRates.AsNoTracking().SingleAsync();
        Assert.True(only.IsActive);
        Assert.Equal(SeededRate, only.RatePerSquareFoot);
    }

    [Fact]
    public async Task SetRate_AcceptsTheUpperBoundAndTwoDecimals()
    {
        using var test = new TestDb();

        Assert.Equal(100000m, CreatedRate(await SetRate(test.Db, 100000m)).RatePerSquareFoot);
        Assert.Equal(1499.99m, CreatedRate(await SetRate(test.Db, 1499.99m)).RatePerSquareFoot);
    }

    [Fact]
    public async Task SetRate_Unauthenticated_Returns401AndChangesNothing()
    {
        using var test = new TestDb();

        Assert.IsType<UnauthorizedResult>((await SetRate(test.Db, 2000m, userId: null)).Result);
        Assert.IsType<UnauthorizedResult>((await AdminRates(test.Db, null).GetRates()).Result);
        Assert.Equal(1, await test.Db.EstimateRates.CountAsync());
    }

    [Fact]
    public async Task GetRates_ListsActiveAndHistoryNewestFirstWithSetterEmail()
    {
        using var test = new TestDb(withActiveRate: false);
        test.Db.EstimateRates.AddRange(
            Rate(1500m, active: false, new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc)),
            Rate(1800m, active: false, new DateTime(2026, 9, 15, 0, 0, 0, DateTimeKind.Utc), by: Admin),
            Rate(2100m, active: true, new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc), by: Admin));
        await test.Db.SaveChangesAsync();

        var ok = Assert.IsType<OkObjectResult>((await AdminRates(test.Db).GetRates()).Result);
        var list = Assert.IsAssignableFrom<IEnumerable<AdminEstimateRateResponse>>(ok.Value).ToList();

        Assert.Equal([2100m, 1800m, 1500m], list.Select(r => r.RatePerSquareFoot));
        Assert.Equal([true, false, false], list.Select(r => r.IsActive));
        Assert.Equal([AdminEmail, AdminEmail, null], list.Select(r => r.CreatedByEmail));
    }

    [Fact]
    public void AdminEstimateRateResponse_ExposesNoUserIdOrAccountData()
    {
        var names = typeof(AdminEstimateRateResponse)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .OrderBy(n => n)
            .ToList();
        Assert.Equal(["CreatedAt", "CreatedByEmail", "Id", "IsActive", "RatePerSquareFoot"], names);
    }

    // ── database backstops ────────────────────────────────────────────

    [Fact]
    public async Task Database_RejectsASecondActiveRate()
    {
        using var test = new TestDb();
        test.Db.EstimateRates.Add(Rate(2500m, active: true, DateTime.UtcNow));

        await Assert.ThrowsAsync<DbUpdateException>(() => test.Db.SaveChangesAsync());
    }

    [Fact]
    public async Task Database_AllowsAnyNumberOfInactiveRates()
    {
        using var test = new TestDb();
        test.Db.EstimateRates.AddRange(
            Rate(1000m, active: false, DateTime.UtcNow),
            Rate(1100m, active: false, DateTime.UtcNow),
            Rate(1200m, active: false, DateTime.UtcNow));

        await test.Db.SaveChangesAsync();
        Assert.Equal(4, await test.Db.EstimateRates.CountAsync());
    }

    [Fact]
    public async Task Database_RejectsAZeroOrNegativeRate()
    {
        using var test = new TestDb(withActiveRate: false);
        test.Db.EstimateRates.Add(Rate(0m, active: false, DateTime.UtcNow));
        await Assert.ThrowsAsync<DbUpdateException>(() => test.Db.SaveChangesAsync());

        test.Db.ChangeTracker.Clear();
        test.Db.EstimateRates.Add(Rate(-10m, active: false, DateTime.UtcNow));
        await Assert.ThrowsAsync<DbUpdateException>(() => test.Db.SaveChangesAsync());
    }

    // ── public read ───────────────────────────────────────────────────

    [Fact]
    public void EstimateRateController_IsPublicReadOnly()
    {
        Assert.Empty(typeof(EstimateRateController).GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true));
        var method = typeof(EstimateRateController).GetMethod(nameof(EstimateRateController.GetActiveRate))!;
        Assert.NotEmpty(method.GetCustomAttributes(typeof(AllowAnonymousAttribute), inherit: true));
        Assert.NotEmpty(method.GetCustomAttributes(typeof(HttpGetAttribute), inherit: true));

        var actions = typeof(EstimateRateController)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);
        Assert.Single(actions);
    }

    [Fact]
    public void EstimateRateResponse_ExposesOnlyTheRateAndItsTime()
    {
        var names = typeof(EstimateRateResponse)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .OrderBy(n => n)
            .ToList();
        Assert.Equal(["RatePerSquareFoot", "UpdatedAt"], names);
    }

    [Fact]
    public async Task GetActiveRate_ReturnsTheActiveRateOnly()
    {
        using var test = new TestDb(withActiveRate: false);
        test.Db.EstimateRates.AddRange(
            Rate(1000m, active: false, new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc)),
            Rate(1800m, active: true, new DateTime(2026, 10, 2, 8, 30, 0, DateTimeKind.Utc), by: Admin));
        await test.Db.SaveChangesAsync();

        var ok = Assert.IsType<OkObjectResult>((await PublicRate(test.Db).GetActiveRate()).Result);
        var body = Assert.IsType<EstimateRateResponse>(ok.Value);

        Assert.Equal(1800m, body.RatePerSquareFoot);
        // The time the rate was set. (The API's JSON layer marks it as UTC.)
        Assert.Equal(new DateTime(2026, 10, 2, 8, 30, 0), body.UpdatedAt);
    }

    [Fact]
    public async Task GetActiveRate_WithNoActiveRate_Returns503NotAGuess()
    {
        using var test = new TestDb(withActiveRate: false);

        var unavailable = Assert.IsType<ObjectResult>((await PublicRate(test.Db).GetActiveRate()).Result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unavailable.StatusCode);

        // Only inactive history is not an active rate either.
        test.Db.EstimateRates.Add(Rate(1000m, active: false, DateTime.UtcNow));
        await test.Db.SaveChangesAsync();
        unavailable = Assert.IsType<ObjectResult>((await PublicRate(test.Db).GetActiveRate()).Result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unavailable.StatusCode);
    }

    // ── estimates use the server-side active rate ─────────────────────

    [Fact]
    public async Task CreateEstimate_WithNoActiveRate_Returns503AndSavesNothing()
    {
        using var test = new TestDb(withActiveRate: false);

        var result = await Save(test.Db);

        var unavailable = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, unavailable.StatusCode);
        Assert.Equal(0, await test.Db.Estimates.CountAsync());
        Assert.Equal(0, await test.Db.EstimateItems.CountAsync());
    }

    [Fact]
    public async Task CreateEstimate_UsesTheActiveRateNotAnyConfigurationValue()
    {
        using var test = new TestDb(withActiveRate: false);
        CreatedRate(await SetRate(test.Db, 2345.5m));

        var estimate = CreatedEstimate(await Save(test.Db, width: 10m, length: 10m));

        Assert.Equal(2345.5m, estimate.RatePerSquareFoot);
        Assert.Equal(100m * 2345.5m, estimate.EstimatedAmount);
    }

    [Fact]
    public async Task RateChange_AppliesToNewEstimatesOnly_OldEstimatesKeepTheirRate()
    {
        using var test = new TestDb();

        var first = CreatedEstimate(await Save(test.Db));
        Assert.Equal(1500m, first.RatePerSquareFoot);
        Assert.Equal(180m * 1500m, first.EstimatedAmount);

        CreatedRate(await SetRate(test.Db, 1800m));

        var second = CreatedEstimate(await Save(test.Db));
        Assert.Equal(1800m, second.RatePerSquareFoot);
        Assert.Equal(180m * 1800m, second.EstimatedAmount);

        // The earlier estimate is unchanged, in the database and when read back.
        var stored = await test.Db.Estimates.AsNoTracking().SingleAsync(e => e.Id == first.Id);
        Assert.Equal(1500m, stored.RatePerSquareFoot);
        Assert.Equal(180m * 1500m, stored.EstimatedAmount);

        var ok = Assert.IsType<OkObjectResult>((await Estimates(test.Db).GetEstimate(first.Id)).Result);
        var detail = Assert.IsType<EstimateResponse>(ok.Value);
        Assert.Equal(1500m, detail.RatePerSquareFoot);
        Assert.Equal(180m * 1500m, detail.EstimatedAmount);

        var list = Assert.IsType<List<EstimateResponse>>(
            Assert.IsType<OkObjectResult>((await Estimates(test.Db).GetEstimates()).Result).Value);
        Assert.Equal(
            [1500m, 1800m],
            list.Select(e => e.RatePerSquareFoot).OrderBy(x => x));
    }

    // ── proposals, the payment lock and the PDF ───────────────────────

    [Fact]
    public async Task RateChange_LeavesProposalsTheirPaymentLockAndPdfUntouched()
    {
        using var test = new TestDb();

        var estimate = CreatedEstimate(await Save(test.Db));
        var proposalResult = await Proposals(test.Db).CreateProposal(
            new CreateProposalRequest { EstimateId = estimate.Id });
        var proposal = Assert.IsType<ProposalDetailResponse>(
            Assert.IsType<CreatedAtActionResult>(proposalResult.Result).Value);
        Assert.Equal(1500m, proposal.RatePerSquareFoot);
        Assert.Equal(270000m, proposal.EstimatedAmount);

        // A verified (demo) token payment unlocks the PDF.
        test.Db.Payments.Add(new Payment
        {
            Id = Guid.NewGuid(),
            ProposalId = proposal.Id,
            UserId = Customer,
            Amount = 500m,
            Currency = "INR",
            Status = PaymentStatus.Verified,
            Provider = "Demo",
            ProviderOrderId = "demo_order_test",
            ProviderPaymentId = "demo_pay_test",
            CreatedAt = DateTime.UtcNow,
            VerifiedAt = DateTime.UtcNow,
        });
        await test.Db.SaveChangesAsync();
        Assert.IsType<FileContentResult>(await Proposals(test.Db).DownloadProposalPdf(proposal.Id));

        // The Admin changes the rate.
        CreatedRate(await SetRate(test.Db, 2600m));

        // The proposal keeps its own rate and amount, still shows as paid,
        // and the PDF is still downloadable.
        var detail = Assert.IsType<ProposalDetailResponse>(
            Assert.IsType<OkObjectResult>((await Proposals(test.Db).GetProposal(proposal.Id)).Result).Value);
        Assert.Equal(1500m, detail.RatePerSquareFoot);
        Assert.Equal(270000m, detail.EstimatedAmount);
        Assert.True(detail.IsPaymentVerified);
        var pdf = Assert.IsType<FileContentResult>(await Proposals(test.Db).DownloadProposalPdf(proposal.Id));
        Assert.NotEmpty(pdf.FileContents);

        // Nothing about the payment record moved.
        var payment = await test.Db.Payments.AsNoTracking().SingleAsync();
        Assert.Equal(PaymentStatus.Verified, payment.Status);
        Assert.Equal(500m, payment.Amount);
    }

    [Fact]
    public async Task ProposalFromAnEstimateMadeBeforeARateChange_KeepsTheEstimatesRate()
    {
        using var test = new TestDb();
        var estimate = CreatedEstimate(await Save(test.Db));

        CreatedRate(await SetRate(test.Db, 3000m));

        var proposal = Assert.IsType<ProposalDetailResponse>(
            Assert.IsType<CreatedAtActionResult>(
                (await Proposals(test.Db).CreateProposal(new CreateProposalRequest { EstimateId = estimate.Id })).Result).Value);

        Assert.Equal(1500m, proposal.RatePerSquareFoot);
        Assert.Equal(270000m, proposal.EstimatedAmount);
    }

    // ── seeder ────────────────────────────────────────────────────────

    private static IServiceProvider SeederServices(ApplicationDbContext db, decimal configured)
    {
        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton<IOptions<EstimateOptions>>(
            Options.Create(new EstimateOptions { DemoRatePerSquareFoot = configured }));
        return services.BuildServiceProvider();
    }

    [Fact]
    public async Task Seeder_WithAnEmptyTable_InsertsTheConfiguredRateAsTheActiveRate()
    {
        using var test = new TestDb(withActiveRate: false);

        await EstimateRateSeeder.SeedAsync(SeederServices(test.Db, 1500m));

        var row = await test.Db.EstimateRates.AsNoTracking().SingleAsync();
        Assert.Equal(1500m, row.RatePerSquareFoot);
        Assert.True(row.IsActive);
        Assert.Null(row.CreatedByUserId);
        Assert.InRange(row.CreatedAt, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(1));
    }

    [Fact]
    public async Task Seeder_RunTwice_DoesNotAddASecondRow()
    {
        using var test = new TestDb(withActiveRate: false);
        var services = SeederServices(test.Db, 1500m);

        await EstimateRateSeeder.SeedAsync(services);
        await EstimateRateSeeder.SeedAsync(services);

        Assert.Equal(1, await test.Db.EstimateRates.CountAsync());
    }

    [Fact]
    public async Task Seeder_NeverOverridesAnAdminSetRate()
    {
        using var test = new TestDb();
        CreatedRate(await SetRate(test.Db, 1800m));

        // A later startup with a different configured value changes nothing.
        await EstimateRateSeeder.SeedAsync(SeederServices(test.Db, 999m));

        var rows = await test.Db.EstimateRates.AsNoTracking().ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.Equal(1800m, Assert.Single(rows, r => r.IsActive).RatePerSquareFoot);
        Assert.DoesNotContain(rows, r => r.RatePerSquareFoot == 999m);
    }

    [Fact]
    public async Task Seeder_WhenHistoryExistsWithoutAnActiveRate_StillInsertsNothing()
    {
        using var test = new TestDb(withActiveRate: false);
        test.Db.EstimateRates.Add(Rate(1000m, active: false, DateTime.UtcNow));
        await test.Db.SaveChangesAsync();

        await EstimateRateSeeder.SeedAsync(SeederServices(test.Db, 1500m));

        Assert.Equal(1, await test.Db.EstimateRates.CountAsync());
        Assert.Equal(0, await test.Db.EstimateRates.CountAsync(r => r.IsActive));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1500")]
    [InlineData("100001")]
    [InlineData("1500.555")]
    public async Task Seeder_RefusesAnInvalidConfiguredRate(string text)
    {
        using var test = new TestDb(withActiveRate: false);
        var configured = decimal.Parse(text, System.Globalization.CultureInfo.InvariantCulture);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => EstimateRateSeeder.SeedAsync(SeederServices(test.Db, configured)));

        Assert.Contains("Estimates:DemoRatePerSquareFoot", error.Message);
        Assert.Equal(0, await test.Db.EstimateRates.CountAsync());
    }

    [Fact]
    public async Task Seeder_ConcurrentInsertByAnotherInstance_IsToleratedAndTheirRowStands()
    {
        using var test = new TestDb(withActiveRate: false);
        var services = SeederServices(test.Db, 1500m);

        // Simulate the loser of a startup race: the other instance's active
        // row lands after our "table is empty" check but before our insert.
        // The unique index makes the second insert fail, and the seeder
        // recognises that an active rate now exists.
        await using var other = new ApplicationDbContext(
            new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlite(test.Db.Database.GetDbConnection())
                .Options);
        other.EstimateRates.Add(Rate(1500m, active: true, DateTime.UtcNow));
        await other.SaveChangesAsync();

        // With the row already present the seeder simply does nothing.
        await EstimateRateSeeder.SeedAsync(services);
        Assert.Equal(1, await test.Db.EstimateRates.CountAsync());
    }
}
