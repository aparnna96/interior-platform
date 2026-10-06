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
using Microsoft.Extensions.Options;
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Razorpay TEST-mode payment foundation (Task 14A). SQLite in-memory is used
/// for relational fidelity. These tests never touch the real SQL Server
/// database and never call the real Razorpay API: the gateway abstraction is
/// faked, and signatures are minted with a deterministic test-only secret.
/// </summary>
public sealed class PaymentsControllerTests
{
    private const string UserA = "user-a";
    private const string UserB = "user-b";
    private const string TestSecret = "test-only-secret";
    private const string TestKeyId = "rzp_test_fake";

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

    private sealed class FakeGateway : IRazorpayPaymentGateway
    {
        public string KeyId { get; set; } = TestKeyId;

        public List<(long Paise, string Currency, string Receipt)> Calls { get; } = [];

        public int OrderCounter;

        public Task<RazorpayOrderResult> CreateOrderAsync(
            long amountPaise, string currency, string receipt, CancellationToken cancellationToken = default)
        {
            Calls.Add((amountPaise, currency, receipt));
            OrderCounter++;
            return Task.FromResult(new RazorpayOrderResult($"order-test-{OrderCounter}", amountPaise, currency));
        }
    }

    private static ClaimsPrincipal PrincipalFor(string? userId) =>
        userId is null
            ? new ClaimsPrincipal(new ClaimsIdentity())
            : new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId)], "Test"));

    private static PaymentsOptions Payments(decimal token = 500m, string currency = "INR") => new()
    {
        TokenAmount = token,
        Currency = currency,
    };

    private static RazorpayOptions Razorpay(string keyId = TestKeyId, string secret = TestSecret) => new()
    {
        KeyId = keyId,
        KeySecret = secret,
    };

    private static PaymentsController PaymentsFor(
        ApplicationDbContext db,
        string? userId,
        PaymentsOptions? payments = null,
        RazorpayOptions? razorpay = null,
        IRazorpayPaymentGateway? gateway = null)
    {
        var controller = new PaymentsController(
            db,
            Options.Create(payments ?? Payments()),
            Options.Create(razorpay ?? Razorpay()),
            gateway ?? new FakeGateway());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = PrincipalFor(userId) },
        };
        return controller;
    }

    private static async Task<Proposal> SeedProposalAsync(ApplicationDbContext db, string userId)
    {
        var estimate = new Estimate
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Width = 12m,
            Length = 15m,
            Area = 180m,
            RatePerSquareFoot = 1500m,
            EstimatedAmount = 270000m,
            CreatedAt = DateTime.UtcNow,
        };
        var proposal = new Proposal
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            EstimateId = estimate.Id,
            Width = 12m,
            Length = 15m,
            Area = 180m,
            RatePerSquareFoot = 1500m,
            EstimatedAmount = 270000m,
            Status = ProposalStatus.Draft,
            CreatedAt = DateTime.UtcNow,
        };
        db.Estimates.Add(estimate);
        db.Proposals.Add(proposal);
        await db.SaveChangesAsync();
        return proposal;
    }

    private static async Task<Payment> SeedPaymentAsync(
        ApplicationDbContext db, Proposal proposal, PaymentStatus status, string orderId)
    {
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            ProposalId = proposal.Id,
            UserId = proposal.UserId,
            Amount = 500m,
            Currency = "INR",
            Status = status,
            Provider = "Razorpay",
            ProviderOrderId = orderId,
            CreatedAt = DateTime.UtcNow,
            VerifiedAt = status == PaymentStatus.Verified ? DateTime.UtcNow : null,
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return payment;
    }

    private static CreatePaymentResponse CreatedPayment(ActionResult<CreatePaymentResponse> result)
    {
        var created = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status201Created, created.StatusCode);
        return Assert.IsType<CreatePaymentResponse>(created.Value);
    }

    private static VerifyPaymentResponse VerifiedPayment(ActionResult<VerifyPaymentResponse> result)
    {
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        return Assert.IsType<VerifyPaymentResponse>(ok.Value);
    }

    private static ObjectResult Problem(ActionResult result, int status)
    {
        var problem = Assert.IsType<ObjectResult>(result);
        Assert.Equal(status, problem.StatusCode);
        return problem;
    }

    private static ObjectResult Problem(ActionResult<CreatePaymentResponse> result, int status) =>
        Problem(result.Result!, status);

    private static ObjectResult Problem(ActionResult<VerifyPaymentResponse> result, int status) =>
        Problem(result.Result!, status);

    [Fact]
    public void PaymentsController_RequiresAuthorization()
    {
        Assert.True(typeof(PaymentsController).GetCustomAttributes(
            typeof(AuthorizeAttribute), inherit: true).Any());
    }

    [Fact]
    public void CreatePayment_TakesNoBody_ClientCannotChooseAmount()
    {
        // The route supplies the proposal id; there is nowhere to put an
        // amount, currency, user id, or status.
        var method = typeof(PaymentsController).GetMethod(
            nameof(PaymentsController.CreatePayment),
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);
        var parameters = method.GetParameters();
        Assert.Single(parameters);
        Assert.Equal(typeof(Guid), parameters[0].ParameterType);
    }

    [Fact]
    public async Task CreatePayment_Owner_CreatesCreatedPaymentWithConfiguredAmount()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();

        var response = CreatedPayment(await PaymentsFor(test.Db, UserA, gateway: gateway)
            .CreatePayment(proposal.Id));

        Assert.NotEqual(Guid.Empty, response.PaymentId);
        Assert.Equal(proposal.Id, response.ProposalId);
        Assert.Equal("Razorpay", response.Provider);
        Assert.Equal("order-test-1", response.ProviderOrderId);
        Assert.Equal(500m, response.Amount);
        Assert.Equal("INR", response.Currency);
        Assert.Equal(TestKeyId, response.ProviderKeyId);

        var stored = await test.Db.Payments.SingleAsync();
        Assert.Equal(response.PaymentId, stored.Id);
        Assert.Equal(UserA, stored.UserId);
        Assert.Equal(PaymentStatus.Created, stored.Status);
        Assert.Equal(500m, stored.Amount);
        Assert.Equal("INR", stored.Currency);
        Assert.Equal("order-test-1", stored.ProviderOrderId);
        Assert.Null(stored.VerifiedAt);
    }

    [Fact]
    public async Task CreatePayment_UsesExactPaiseConversion()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();

        // Fractional major units must convert exactly: 777.50 INR = 77750 paise.
        CreatedPayment(await PaymentsFor(test.Db, UserA, Payments(777.50m), gateway: gateway)
            .CreatePayment(proposal.Id));

        var call = Assert.Single(gateway.Calls);
        Assert.Equal(77750L, call.Paise);
        Assert.Equal("INR", call.Currency);
    }

    [Fact]
    public async Task CreatePayment_Unauthenticated_Returns401()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();

        Assert.IsType<UnauthorizedResult>(
            (await PaymentsFor(test.Db, null, gateway: gateway).CreatePayment(proposal.Id)).Result);
        Assert.Empty(gateway.Calls);
        Assert.Equal(0, await test.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task CreatePayment_MissingProposal_Returns404()
    {
        using var test = new TestDb();
        var gateway = new FakeGateway();

        Assert.IsType<NotFoundResult>(
            (await PaymentsFor(test.Db, UserA, gateway: gateway).CreatePayment(Guid.NewGuid())).Result);
        Assert.Empty(gateway.Calls);
    }

    [Fact]
    public async Task CreatePayment_OtherUsersProposal_Returns404()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();

        Assert.IsType<NotFoundResult>(
            (await PaymentsFor(test.Db, UserB, gateway: gateway).CreatePayment(proposal.Id)).Result);
        Assert.Empty(gateway.Calls);
        Assert.Equal(0, await test.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task CreatePayment_VerifiedProposal_Returns409WithoutNewOrder()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        await SeedPaymentAsync(test.Db, proposal, PaymentStatus.Verified, "order-test-0");
        var gateway = new FakeGateway();

        Problem(
            await PaymentsFor(test.Db, UserA, gateway: gateway).CreatePayment(proposal.Id),
            StatusCodes.Status409Conflict);
        Assert.Empty(gateway.Calls);
        Assert.Equal(1, await test.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task CreatePayment_OpenCreatedPayment_IsReusedWithoutNewOrder()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();
        var controller = PaymentsFor(test.Db, UserA, gateway: gateway);

        var first = CreatedPayment(await controller.CreatePayment(proposal.Id));
        var reused = Assert.IsType<OkObjectResult>(
            (await controller.CreatePayment(proposal.Id)).Result).Value as CreatePaymentResponse;
        Assert.NotNull(reused);

        Assert.Equal(first.PaymentId, reused.PaymentId);
        Assert.Equal(first.ProviderOrderId, reused.ProviderOrderId);
        Assert.Single(gateway.Calls);
        Assert.Equal(1, await test.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task CreatePayment_FailedPayment_AllowsRetryWithNewOrder()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        await SeedPaymentAsync(test.Db, proposal, PaymentStatus.Failed, "order-test-0");
        var gateway = new FakeGateway();

        var response = CreatedPayment(await PaymentsFor(test.Db, UserA, gateway: gateway)
            .CreatePayment(proposal.Id));

        Assert.Equal("order-test-1", response.ProviderOrderId);
        Assert.Single(gateway.Calls);
        Assert.Equal(2, await test.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task CreatePayment_MissingRazorpayCredentials_Returns500WithoutRecord()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway { KeyId = string.Empty };

        var problem = Problem(
            await PaymentsFor(test.Db, UserA, gateway: gateway).CreatePayment(proposal.Id),
            StatusCodes.Status500InternalServerError);
        Assert.DoesNotContain(TestSecret, problem.Value?.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.Empty(gateway.Calls);
        Assert.Equal(0, await test.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task CreatePayment_InvalidTokenAmount_Returns500WithoutRecord()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();

        Problem(
            await PaymentsFor(test.Db, UserA, Payments(0m), gateway: gateway).CreatePayment(proposal.Id),
            StatusCodes.Status500InternalServerError);
        Assert.Empty(gateway.Calls);
        Assert.Equal(0, await test.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task VerifyPayment_ValidSignature_MarksVerified()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();
        var created = CreatedPayment(await PaymentsFor(test.Db, UserA, gateway: gateway)
            .CreatePayment(proposal.Id));

        const string providerPaymentId = "pay-test-1";
        var signature = RazorpaySignatureVerifier.Compute(TestSecret, created.ProviderOrderId, providerPaymentId);

        var response = VerifiedPayment(await PaymentsFor(test.Db, UserA)
            .VerifyPayment(new VerifyPaymentRequest
            {
                PaymentId = created.PaymentId,
                RazorpayOrderId = created.ProviderOrderId,
                RazorpayPaymentId = providerPaymentId,
                RazorpaySignature = signature,
            }));

        Assert.Equal(created.PaymentId, response.PaymentId);
        Assert.Equal(proposal.Id, response.ProposalId);
        Assert.Equal(PaymentStatus.Verified, response.Status);
        Assert.NotNull(response.VerifiedAt);

        var stored = await test.Db.Payments.SingleAsync(p => p.Id == created.PaymentId);
        Assert.Equal(PaymentStatus.Verified, stored.Status);
        Assert.Equal(providerPaymentId, stored.ProviderPaymentId);
        Assert.Equal(signature, stored.ProviderSignature);
        Assert.NotNull(stored.VerifiedAt);
    }

    [Fact]
    public async Task VerifyPayment_InvalidSignature_FailsWithoutVerifying()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();
        var created = CreatedPayment(await PaymentsFor(test.Db, UserA, gateway: gateway)
            .CreatePayment(proposal.Id));

        Problem(
            await PaymentsFor(test.Db, UserA).VerifyPayment(new VerifyPaymentRequest
            {
                PaymentId = created.PaymentId,
                RazorpayOrderId = created.ProviderOrderId,
                RazorpayPaymentId = "pay-test-1",
                RazorpaySignature = new string('0', 64),
            }),
            StatusCodes.Status400BadRequest);

        var stored = await test.Db.Payments.SingleAsync(p => p.Id == created.PaymentId);
        Assert.Equal(PaymentStatus.Failed, stored.Status);
        Assert.Null(stored.VerifiedAt);
        Assert.Null(stored.ProviderPaymentId);
    }

    [Fact]
    public async Task VerifyPayment_MismatchedOrderId_FailsAndKeepsCreated()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();
        var created = CreatedPayment(await PaymentsFor(test.Db, UserA, gateway: gateway)
            .CreatePayment(proposal.Id));

        var result = await PaymentsFor(test.Db, UserA).VerifyPayment(new VerifyPaymentRequest
        {
            PaymentId = created.PaymentId,
            RazorpayOrderId = "order-someone-else",
            RazorpayPaymentId = "pay-test-1",
            RazorpaySignature = RazorpaySignatureVerifier.Compute(TestSecret, "order-someone-else", "pay-test-1"),
        });
        var bad = Assert.IsType<ObjectResult>(result.Result);
        // Direct controller calls bypass model-binding validation, so the
        // explicit in-action check produces ValidationProblem(): an
        // ObjectResult carrying ValidationProblemDetails (StatusCode is
        // applied as 400 by the HTTP pipeline from the problem details).
        Assert.True(
            bad.StatusCode == StatusCodes.Status400BadRequest ||
            (bad.StatusCode is null && bad.Value is ValidationProblemDetails),
            $"Expected 400, got {bad.StatusCode}.");

        var stored = await test.Db.Payments.SingleAsync(p => p.Id == created.PaymentId);
        Assert.Equal(PaymentStatus.Created, stored.Status);
        Assert.Null(stored.VerifiedAt);
    }

    [Fact]
    public async Task VerifyPayment_WrongUser_Returns404()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();
        var created = CreatedPayment(await PaymentsFor(test.Db, UserA, gateway: gateway)
            .CreatePayment(proposal.Id));

        Assert.IsType<NotFoundResult>((await PaymentsFor(test.Db, UserB).VerifyPayment(new VerifyPaymentRequest
        {
            PaymentId = created.PaymentId,
            RazorpayOrderId = created.ProviderOrderId,
            RazorpayPaymentId = "pay-test-1",
            RazorpaySignature = RazorpaySignatureVerifier.Compute(TestSecret, created.ProviderOrderId, "pay-test-1"),
        })).Result);

        Assert.Equal(PaymentStatus.Created, (await test.Db.Payments.SingleAsync()).Status);
    }

    [Fact]
    public async Task VerifyPayment_MissingPayment_Returns404()
    {
        using var test = new TestDb();

        Assert.IsType<NotFoundResult>((await PaymentsFor(test.Db, UserA).VerifyPayment(new VerifyPaymentRequest
        {
            PaymentId = Guid.NewGuid(),
            RazorpayOrderId = "order-test-0",
            RazorpayPaymentId = "pay-test-0",
            RazorpaySignature = new string('0', 64),
        })).Result);
    }

    [Fact]
    public async Task VerifyPayment_AlreadyVerified_SucceedsIdempotently()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();
        var created = CreatedPayment(await PaymentsFor(test.Db, UserA, gateway: gateway)
            .CreatePayment(proposal.Id));

        const string providerPaymentId = "pay-test-1";
        var first = VerifiedPayment(await PaymentsFor(test.Db, UserA).VerifyPayment(new VerifyPaymentRequest
        {
            PaymentId = created.PaymentId,
            RazorpayOrderId = created.ProviderOrderId,
            RazorpayPaymentId = providerPaymentId,
            RazorpaySignature = RazorpaySignatureVerifier.Compute(TestSecret, created.ProviderOrderId, providerPaymentId),
        }));

        var second = VerifiedPayment(await PaymentsFor(test.Db, UserA).VerifyPayment(new VerifyPaymentRequest
        {
            PaymentId = created.PaymentId,
            RazorpayOrderId = created.ProviderOrderId,
            RazorpayPaymentId = providerPaymentId,
            RazorpaySignature = RazorpaySignatureVerifier.Compute(TestSecret, created.ProviderOrderId, providerPaymentId),
        }));

        Assert.Equal(PaymentStatus.Verified, second.Status);
        Assert.Equal(first.VerifiedAt, second.VerifiedAt);
        Assert.Equal(1, await test.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task VerifyPayment_MissingRazorpaySecret_Returns500WithoutVerifying()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway();
        var created = CreatedPayment(await PaymentsFor(test.Db, UserA, gateway: gateway)
            .CreatePayment(proposal.Id));

        var controller = PaymentsFor(
            test.Db, UserA, razorpay: Razorpay(secret: string.Empty), gateway: gateway);
        Problem(await controller.VerifyPayment(new VerifyPaymentRequest
        {
            PaymentId = created.PaymentId,
            RazorpayOrderId = created.ProviderOrderId,
            RazorpayPaymentId = "pay-test-1",
            RazorpaySignature = RazorpaySignatureVerifier.Compute(TestSecret, created.ProviderOrderId, "pay-test-1"),
        }), StatusCodes.Status500InternalServerError);

        Assert.Equal(PaymentStatus.Created, (await test.Db.Payments.SingleAsync()).Status);
    }

    [Fact]
    public async Task VerifyPayment_Unauthenticated_Returns401()
    {
        using var test = new TestDb();

        Assert.IsType<UnauthorizedResult>((await PaymentsFor(test.Db, null).VerifyPayment(new VerifyPaymentRequest
        {
            PaymentId = Guid.NewGuid(),
            RazorpayOrderId = "order-test-0",
            RazorpayPaymentId = "pay-test-0",
            RazorpaySignature = new string('0', 64),
        })).Result);
    }

    [Fact]
    public async Task VerifyPayment_EmptyPaymentId_Returns400()
    {
        using var test = new TestDb();

        var result = await PaymentsFor(test.Db, UserA).VerifyPayment(new VerifyPaymentRequest
        {
            PaymentId = Guid.Empty,
            RazorpayOrderId = "order-test-0",
            RazorpayPaymentId = "pay-test-0",
            RazorpaySignature = new string('0', 64),
        });
        var bad = Assert.IsType<ObjectResult>(result.Result);
        Assert.True(
            bad.StatusCode == StatusCodes.Status400BadRequest ||
            (bad.StatusCode is null && bad.Value is ValidationProblemDetails),
            $"Expected 400, got {bad.StatusCode}.");
    }

    [Fact]
    public void Responses_ExposeNoSecrets()
    {
        foreach (var type in new[] { typeof(CreatePaymentResponse), typeof(VerifyPaymentResponse) })
        {
            var names = type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Select(p => p.Name)
                .ToList();
            Assert.DoesNotContain(names, n => n.Contains("Secret", StringComparison.OrdinalIgnoreCase));
            Assert.DoesNotContain(names, n => n.Contains("Jwt", StringComparison.OrdinalIgnoreCase));
        }

        var createJson = JsonSerializer.Serialize(new CreatePaymentResponse
        {
            PaymentId = Guid.NewGuid(),
            ProposalId = Guid.NewGuid(),
            Provider = "Razorpay",
            ProviderOrderId = "order-test-1",
            Amount = 500m,
            Currency = "INR",
            ProviderKeyId = TestKeyId,
        });
        var verifyJson = JsonSerializer.Serialize(new VerifyPaymentResponse
        {
            PaymentId = Guid.NewGuid(),
            ProposalId = Guid.NewGuid(),
            Status = PaymentStatus.Verified,
            VerifiedAt = DateTime.UtcNow,
        });
        Assert.DoesNotContain("secret", createJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secret", verifyJson, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("order-test-1", "pay-test-1")]
    [InlineData("order_abc123", "pay_xyz789")]
    public void SignatureVerifier_AcceptsValidSignature(string orderId, string paymentId)
    {
        var signature = RazorpaySignatureVerifier.Compute(TestSecret, orderId, paymentId);
        Assert.True(RazorpaySignatureVerifier.Verify(TestSecret, orderId, paymentId, signature));
    }

    [Fact]
    public void SignatureVerifier_RejectsWrongSecret()
    {
        var signature = RazorpaySignatureVerifier.Compute(TestSecret, "order-test-1", "pay-test-1");
        Assert.False(RazorpaySignatureVerifier.Verify("other-secret", "order-test-1", "pay-test-1", signature));
    }

    [Fact]
    public void SignatureVerifier_RejectsTamperedSignature()
    {
        var signature = RazorpaySignatureVerifier.Compute(TestSecret, "order-test-1", "pay-test-1");
        var tampered = (signature[0] == '0' ? '1' : '0') + signature[1..];
        Assert.False(RazorpaySignatureVerifier.Verify(TestSecret, "order-test-1", "pay-test-1", tampered));
    }

    [Fact]
    public void SignatureVerifier_RejectsMismatchedIds()
    {
        var signature = RazorpaySignatureVerifier.Compute(TestSecret, "order-test-1", "pay-test-1");
        Assert.False(RazorpaySignatureVerifier.Verify(TestSecret, "order-other", "pay-test-1", signature));
        Assert.False(RazorpaySignatureVerifier.Verify(TestSecret, "order-test-1", "pay-other", signature));
    }

    [Fact]
    public void SignatureVerifier_RejectsMissingOrMalformedInput()
    {
        Assert.False(RazorpaySignatureVerifier.Verify(string.Empty, "order-test-1", "pay-test-1", new string('0', 64)));
        Assert.False(RazorpaySignatureVerifier.Verify(TestSecret, string.Empty, "pay-test-1", new string('0', 64)));
        Assert.False(RazorpaySignatureVerifier.Verify(TestSecret, "order-test-1", "pay-test-1", "not-hex!!"));
        Assert.False(RazorpaySignatureVerifier.Verify(TestSecret, "order-test-1", "pay-test-1", "abc"));
    }

    // ── Payments:Mode=Demo ─────────────────────────────────────────────

    private static PaymentsOptions DemoPayments() => new()
    {
        TokenAmount = 500m,
        Currency = "INR",
        Mode = PaymentsOptions.DemoMode,
    };

    private static async Task<Payment> SeedDemoPaymentAsync(
        ApplicationDbContext db, Proposal proposal, PaymentStatus status = PaymentStatus.Created)
    {
        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            ProposalId = proposal.Id,
            UserId = proposal.UserId,
            Amount = 500m,
            Currency = "INR",
            Status = status,
            Provider = "Demo",
            ProviderOrderId = $"demo_order_{Guid.NewGuid():N}",
            CreatedAt = DateTime.UtcNow,
            VerifiedAt = status == PaymentStatus.Verified ? DateTime.UtcNow : null,
        };
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return payment;
    }

    [Fact]
    public void PaymentsMode_DefaultsToRazorpay_AndValidatesValues()
    {
        Assert.False(new PaymentsOptions().IsDemo);
        Assert.Equal(PaymentsOptions.RazorpayMode, new PaymentsOptions().Mode);
        Assert.True(PaymentsOptions.IsValidMode("Razorpay"));
        Assert.True(PaymentsOptions.IsValidMode("demo"));
        Assert.False(PaymentsOptions.IsValidMode("Demoo"));
        Assert.False(PaymentsOptions.IsValidMode(""));
        Assert.False(PaymentsOptions.IsValidMode(null));
    }

    [Fact]
    public void DemoConfirmPaymentRequest_ExposesOnlyPaymentId()
    {
        var names = typeof(DemoConfirmPaymentRequest)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToList();
        Assert.Equal(["PaymentId"], names);
    }

    [Fact]
    public async Task DemoMode_CreatePayment_NeedsNoRazorpayCredentialsOrGatewayCall()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var gateway = new FakeGateway { KeyId = string.Empty };

        var response = CreatedPayment(await PaymentsFor(
                test.Db, UserA, DemoPayments(), Razorpay(keyId: "", secret: ""), gateway)
            .CreatePayment(proposal.Id));

        Assert.Empty(gateway.Calls);
        Assert.Equal("Demo", response.Provider);
        Assert.StartsWith("demo_order_", response.ProviderOrderId);
        Assert.Equal(string.Empty, response.ProviderKeyId);
        Assert.Equal(500m, response.Amount);

        var stored = await test.Db.Payments.SingleAsync();
        Assert.Equal("Demo", stored.Provider);
        Assert.Equal(PaymentStatus.Created, stored.Status);
        Assert.Null(stored.VerifiedAt);
    }

    [Fact]
    public async Task DemoMode_CreatePayment_ReusesOpenDemoOrder()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var controller = PaymentsFor(test.Db, UserA, DemoPayments());

        var first = CreatedPayment(await controller.CreatePayment(proposal.Id));
        var second = Assert.IsType<CreatePaymentResponse>(Assert.IsType<OkObjectResult>(
            (await controller.CreatePayment(proposal.Id)).Result).Value);

        Assert.Equal(first.PaymentId, second.PaymentId);
        Assert.Equal(1, await test.Db.Payments.CountAsync());
    }

    [Fact]
    public async Task DemoMode_Confirm_VerifiesOwnDemoPayment()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var controller = PaymentsFor(test.Db, UserA, DemoPayments());
        var created = CreatedPayment(await controller.CreatePayment(proposal.Id));

        var outcome = VerifiedPayment(await controller.ConfirmDemoPayment(
            new DemoConfirmPaymentRequest { PaymentId = created.PaymentId }));

        Assert.Equal(PaymentStatus.Verified, outcome.Status);
        Assert.NotNull(outcome.VerifiedAt);
        var stored = await test.Db.Payments.SingleAsync();
        Assert.Equal(PaymentStatus.Verified, stored.Status);
        Assert.StartsWith("demo_pay_", stored.ProviderPaymentId);

        // Confirming again is idempotent.
        var again = VerifiedPayment(await controller.ConfirmDemoPayment(
            new DemoConfirmPaymentRequest { PaymentId = created.PaymentId }));
        Assert.Equal(PaymentStatus.Verified, again.Status);
    }

    [Fact]
    public async Task DemoMode_Confirm_UnlocksTheProposalPdfGate()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var controller = PaymentsFor(test.Db, UserA, DemoPayments());
        var created = CreatedPayment(await controller.CreatePayment(proposal.Id));
        await controller.ConfirmDemoPayment(new DemoConfirmPaymentRequest { PaymentId = created.PaymentId });

        var proposals = new ProposalsController(test.Db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = PrincipalFor(UserA) },
            },
        };
        Assert.IsType<FileContentResult>(await proposals.DownloadProposalPdf(proposal.Id));
    }

    [Fact]
    public async Task RazorpayMode_DemoConfirm_DoesNotExist()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var payment = await SeedDemoPaymentAsync(test.Db, proposal);

        // Default mode is Razorpay: the demo endpoint must be a plain 404.
        var result = await PaymentsFor(test.Db, UserA)
            .ConfirmDemoPayment(new DemoConfirmPaymentRequest { PaymentId = payment.Id });

        Assert.IsType<NotFoundResult>(result.Result);
        Assert.Equal(PaymentStatus.Created, (await test.Db.Payments.SingleAsync()).Status);
    }

    [Fact]
    public async Task DemoMode_Confirm_OtherUsersPayment_Returns404()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var payment = await SeedDemoPaymentAsync(test.Db, proposal);

        var result = await PaymentsFor(test.Db, UserB, DemoPayments())
            .ConfirmDemoPayment(new DemoConfirmPaymentRequest { PaymentId = payment.Id });

        Assert.IsType<NotFoundResult>(result.Result);
        Assert.Equal(PaymentStatus.Created, (await test.Db.Payments.SingleAsync()).Status);
    }

    [Fact]
    public async Task DemoMode_Confirm_CannotSettleARealRazorpayPayment()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var real = await SeedPaymentAsync(test.Db, proposal, PaymentStatus.Created, "order-real-1");

        var result = await PaymentsFor(test.Db, UserA, DemoPayments())
            .ConfirmDemoPayment(new DemoConfirmPaymentRequest { PaymentId = real.Id });

        Assert.IsType<NotFoundResult>(result.Result);
        Assert.Equal(PaymentStatus.Created, (await test.Db.Payments.SingleAsync()).Status);
    }

    [Fact]
    public async Task DemoMode_Confirm_RejectsEmptyIdAndAnonymous()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var payment = await SeedDemoPaymentAsync(test.Db, proposal);

        var empty = await PaymentsFor(test.Db, UserA, DemoPayments())
            .ConfirmDemoPayment(new DemoConfirmPaymentRequest { PaymentId = Guid.Empty });
        Assert.NotNull(Assert.IsType<ObjectResult>(empty.Result).Value);

        var anonymous = await PaymentsFor(test.Db, null, DemoPayments())
            .ConfirmDemoPayment(new DemoConfirmPaymentRequest { PaymentId = payment.Id });
        Assert.IsType<UnauthorizedResult>(anonymous.Result);
        Assert.Equal(PaymentStatus.Created, (await test.Db.Payments.SingleAsync()).Status);
    }

    [Fact]
    public async Task DemoMode_Confirm_SecondVerifiedPaymentOnSameProposal_Returns409()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        await SeedDemoPaymentAsync(test.Db, proposal, PaymentStatus.Verified);
        var open = await SeedDemoPaymentAsync(test.Db, proposal);

        var result = await PaymentsFor(test.Db, UserA, DemoPayments())
            .ConfirmDemoPayment(new DemoConfirmPaymentRequest { PaymentId = open.Id });

        Problem(result, StatusCodes.Status409Conflict);
        Assert.Equal(PaymentStatus.Created,
            (await test.Db.Payments.SingleAsync(p => p.Id == open.Id)).Status);
    }

    [Fact]
    public async Task Verify_RejectsDemoPayments_SoNoSignatureBypassExists()
    {
        using var test = new TestDb();
        var proposal = await SeedProposalAsync(test.Db, UserA);
        var payment = await SeedDemoPaymentAsync(test.Db, proposal);

        var result = await PaymentsFor(test.Db, UserA, DemoPayments()).VerifyPayment(
            new VerifyPaymentRequest
            {
                PaymentId = payment.Id,
                RazorpayOrderId = payment.ProviderOrderId!,
                RazorpayPaymentId = "pay_x",
                RazorpaySignature = "sig",
            });

        Problem(result, StatusCodes.Status400BadRequest);
        Assert.Equal(PaymentStatus.Created, (await test.Db.Payments.SingleAsync()).Status);
    }
}
