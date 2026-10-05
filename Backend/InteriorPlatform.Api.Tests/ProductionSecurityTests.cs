using InteriorPlatform.Api.Configuration;
using InteriorPlatform.Api.Controllers;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Production security cleanup (Task 17B): JWT issuer/audience validation,
/// rate limiting, safe global exception handling and logging. Scenario tests
/// run the real controllers, Identity, JWT bearer, rate limiter and
/// exception handler on a loopback Kestrel host (in-memory SQLite, fake
/// configuration values only). Nothing touches a real database, Razorpay or
/// any external service.
/// </summary>
public sealed class ProductionSecurityTests
{
    // Fake, test-only values.
    private const string JwtSecret = "unit-test-signing-key-at-least-32-bytes-long!!";
    private const string Issuer = "Test.Issuer";
    private const string Audience = "Test.Audience";
    private const string UserPassword = "Test#Pass123";

    private const string BoomDetail =
        "SELECT * FROM Secrets; Server=db.internal;Password=hunter2 at C:\\src\\Secret.cs";

    // ───────────────────────── JwtSettings (unit) ─────────────────────────

    private static IConfiguration ConfigOf(params (string Key, string? Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.ToDictionary(v => v.Key, v => v.Value))
            .Build();

    private static IConfiguration FullJwtConfig() => ConfigOf(
        ("Jwt:Secret", JwtSecret), ("Jwt:Issuer", Issuer), ("Jwt:Audience", Audience));

    private static string MakeToken(
        string? issuer, string? audience, string secret, DateTime expires, params string[] roles)
    {
        var claims = new List<Claim> { new(JwtRegisteredClaimNames.Sub, "user-1") };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));
        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            notBefore: null,
            expires: expires,
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static void Validate(string token) =>
        new JwtSecurityTokenHandler().ValidateToken(
            token, JwtSettings.Load(FullJwtConfig()).CreateValidationParameters(), out _);

    [Fact]
    public void Jwt_Load_WithAllValues_Succeeds()
    {
        var settings = JwtSettings.Load(FullJwtConfig());
        Assert.Equal(Issuer, settings.Issuer);
        Assert.Equal(Audience, settings.Audience);
    }

    [Theory]
    [InlineData("Jwt:Secret")]
    [InlineData("Jwt:Issuer")]
    [InlineData("Jwt:Audience")]
    public void Jwt_Load_MissingOrBlankValue_FailsNamingTheKeyWithoutLeakingSecrets(string missingKey)
    {
        foreach (var blank in new string?[] { null, "", "   " })
        {
            var values = new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = JwtSecret,
                ["Jwt:Issuer"] = Issuer,
                ["Jwt:Audience"] = Audience,
            };
            values[missingKey] = blank;
            var config = new ConfigurationBuilder().AddInMemoryCollection(values).Build();

            var error = Assert.Throws<InvalidOperationException>(() => JwtSettings.Load(config));
            Assert.Contains(missingKey, error.Message);
            Assert.DoesNotContain(JwtSecret, error.Message);
        }
    }

    [Theory]
    [InlineData("Jwt:Issuer")]
    [InlineData("Jwt:Audience")]
    public void Jwt_Load_PlaceholderIssuerOrAudience_Fails(string key)
    {
        var values = new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSecret,
            ["Jwt:Issuer"] = Issuer,
            ["Jwt:Audience"] = Audience,
            [key] = JwtSettings.PlaceholderPrefix + "DEPLOYMENT_VALUE",
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(values).Build();

        var error = Assert.Throws<InvalidOperationException>(() => JwtSettings.Load(config));
        Assert.Contains(key, error.Message);
        Assert.Contains("placeholder", error.Message);
        Assert.DoesNotContain(JwtSecret, error.Message);
    }

    [Fact]
    public void Jwt_ValidationParameters_EnableEveryCheck()
    {
        var parameters = JwtSettings.Load(FullJwtConfig()).CreateValidationParameters();
        Assert.True(parameters.ValidateIssuerSigningKey);
        Assert.True(parameters.ValidateIssuer);
        Assert.True(parameters.ValidateAudience);
        Assert.True(parameters.ValidateLifetime);
        Assert.Equal(Issuer, parameters.ValidIssuer);
        Assert.Equal(Audience, parameters.ValidAudience);
        Assert.Equal(TimeSpan.FromMinutes(1), parameters.ClockSkew);
        Assert.Equal(parameters.ClockSkew, JwtSettings.ClockSkew);
    }

    [Fact]
    public void Jwt_ValidToken_WithCorrectIssuerAndAudience_IsAccepted() =>
        Validate(MakeToken(Issuer, Audience, JwtSecret, DateTime.UtcNow.AddMinutes(5)));

    [Fact]
    public void Jwt_WrongIssuer_IsRejected() =>
        Assert.Throws<SecurityTokenInvalidIssuerException>(() =>
            Validate(MakeToken("Other.Issuer", Audience, JwtSecret, DateTime.UtcNow.AddMinutes(5))));

    [Fact]
    public void Jwt_WrongAudience_IsRejected() =>
        Assert.Throws<SecurityTokenInvalidAudienceException>(() =>
            Validate(MakeToken(Issuer, "Other.Audience", JwtSecret, DateTime.UtcNow.AddMinutes(5))));

    [Fact]
    public void Jwt_TokenWithoutIssuerOrAudience_IsRejected() =>
        Assert.ThrowsAny<SecurityTokenException>(() =>
            Validate(MakeToken(null, null, JwtSecret, DateTime.UtcNow.AddMinutes(5))));

    [Fact]
    public void Jwt_WrongSigningKey_IsRejected() =>
        Assert.ThrowsAny<SecurityTokenException>(() =>
            Validate(MakeToken(Issuer, Audience, "a-different-signing-key-also-32-bytes-long!!", DateTime.UtcNow.AddMinutes(5))));

    [Fact]
    public void Jwt_ExpiredBeyondSkew_IsRejected_ButSmallDriftIsTolerated()
    {
        Validate(MakeToken(Issuer, Audience, JwtSecret, DateTime.UtcNow.AddSeconds(-30)));
        Assert.Throws<SecurityTokenExpiredException>(() =>
            Validate(MakeToken(Issuer, Audience, JwtSecret, DateTime.UtcNow.AddMinutes(-5))));
    }

    // ─────────────────────── Scenario host (real pipeline) ───────────────────────

    private sealed record LogEntry(
        string Category,
        LogLevel Level,
        string Message,
        Exception? Exception,
        IReadOnlyDictionary<string, object?> State);

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public ConcurrentQueue<LogEntry> Entries { get; } = new();

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, Entries);

        public void Dispose()
        {
        }
    }

    private sealed class CapturingLogger(string category, ConcurrentQueue<LogEntry> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            var values = new Dictionary<string, object?>();
            if (state is IEnumerable<KeyValuePair<string, object?>> pairs)
            {
                foreach (var pair in pairs)
                {
                    values[pair.Key] = pair.Value;
                }
            }

            entries.Enqueue(new LogEntry(category, logLevel, formatter(state, exception), exception, values));
        }
    }

    private static IResult Boom() => throw new InvalidOperationException(BoomDetail);

    private sealed class TestApi : IAsyncDisposable
    {
        private readonly WebApplication _app;
        private readonly SqliteConnection _connection;

        private TestApi(WebApplication app, SqliteConnection connection, HttpClient client, CapturingLoggerProvider logs)
        {
            _app = app;
            _connection = connection;
            Client = client;
            Logs = logs;
        }

        public HttpClient Client { get; }

        public CapturingLoggerProvider Logs { get; }

        public static async Task<TestApi> StartAsync(
            string environment = "Production", Action<Dictionary<string, string?>>? configure = null)
        {
            var settings = new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = JwtSecret,
                ["Jwt:Issuer"] = Issuer,
                ["Jwt:Audience"] = Audience,
                // Very high by default; individual tests lower what they exercise.
                // A long window keeps the tests independent of wall-clock timing.
                ["RateLimiting:AuthLogin:PermitLimit"] = "1000",
                ["RateLimiting:AuthLogin:WindowSeconds"] = "3600",
                ["RateLimiting:AuthRegister:PermitLimit"] = "1000",
                ["RateLimiting:AuthRegister:WindowSeconds"] = "3600",
                ["RateLimiting:LeadsSubmit:PermitLimit"] = "1000",
                ["RateLimiting:LeadsSubmit:WindowSeconds"] = "3600",
            };
            configure?.Invoke(settings);

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = environment });
            builder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
            builder.Configuration.AddInMemoryCollection(settings);

            var logs = new CapturingLoggerProvider();
            builder.Logging.ClearProviders();
            builder.Logging.AddProvider(logs);

            var connection = new SqliteConnection("DataSource=:memory:");
            connection.Open();
            builder.Services.AddDbContext<ApplicationDbContext>(o => o.UseSqlite(connection));
            builder.Services.AddIdentity<ApplicationUser, IdentityRole>()
                .AddEntityFrameworkStores<ApplicationDbContext>()
                .AddDefaultTokenProviders();

            var jwt = JwtSettings.Load(builder.Configuration);
            builder.Services.AddSingleton(jwt);
            builder.Services.AddAuthentication(o =>
            {
                o.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                o.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(o => o.TokenValidationParameters = jwt.CreateValidationParameters());
            builder.Services.AddAuthorization();
            builder.Services.AddApiRateLimiting(builder.Configuration);
            builder.Services
                .AddControllers(o => o.HideDevelopmentOnlyControllers(builder.Environment))
                .AddApplicationPart(typeof(AuthController).Assembly);
            builder.Services.AddProxyHeaderHandling(builder.Environment);
            builder.Services.AddCors(o => o.AddPolicy("Frontend", p => p
                .WithOrigins("http://localhost:4200")
                .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")
                .WithHeaders("Content-Type", "Authorization")));

            var app = builder.Build();

            using (var scope = app.Services.CreateScope())
            {
                scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.EnsureCreated();
                await RoleSeeder.SeedAsync(scope.ServiceProvider);
            }

            // Same middleware order as Program.cs.
            app.UseForwardedHeaders();
            app.UseSafeExceptionHandling("Frontend");
            app.UseHttpsRedirectionExceptHealth();
            app.UseCors("Frontend");
            app.UseRateLimiter();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapControllers();
            app.MapHealth();
            app.MapMethods("/boom", new[] { "GET", "POST" }, Boom);
            await app.StartAsync();

            var address = app.Services.GetRequiredService<IServer>()
                .Features.Get<IServerAddressesFeature>()!.Addresses.First();
            var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
            {
                BaseAddress = new Uri(address),
            };
            return new TestApi(app, connection, client, logs);
        }

        public async Task CreateUserAsync(string email, params string[] roles)
        {
            using var scope = _app.Services.CreateScope();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser { UserName = email, Email = email };
            Assert.True((await users.CreateAsync(user, UserPassword)).Succeeded);
            foreach (var role in roles)
            {
                Assert.True((await users.AddToRoleAsync(user, role)).Succeeded);
            }
        }

        public async Task<string> LoginAsync(string email)
        {
            var response = await PostLoginAsync(email, UserPassword);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var json = await response.Content.ReadFromJsonAsync<JsonElement>();
            return json.GetProperty("token").GetString()!;
        }

        public Task<HttpResponseMessage> PostLoginAsync(string email, string password, string? forwardedFor = null) =>
            SendAsync(HttpMethod.Post, "/api/auth/login", content: JsonContent.Create(new { email, password }), forwardedFor: forwardedFor);

        public Task<HttpResponseMessage> PostRegisterAsync(string email) =>
            SendAsync(HttpMethod.Post, "/api/auth/register", content: JsonContent.Create(new { email, password = UserPassword }));

        public Task<HttpResponseMessage> PostLeadAsync() =>
            SendAsync(HttpMethod.Post, "/api/leads", content: JsonContent.Create(new
            {
                name = "Asha Rao",
                phone = "+911234567890",
                message = "Living room makeover.",
            }));

        public async Task<HttpResponseMessage> SendAsync(
            HttpMethod method, string path, string? token = null, HttpContent? content = null,
            string? forwardedFor = null, Action<HttpRequestMessage>? tweak = null)
        {
            using var request = new HttpRequestMessage(method, path) { Content = content };
            if (token is not null)
            {
                request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");
            }

            if (forwardedFor is not null)
            {
                request.Headers.Add("X-Forwarded-For", forwardedFor);
            }

            tweak?.Invoke(request);
            return await Client.SendAsync(request);
        }

        public Task<HttpResponseMessage> GetAsync(string path, string? token = null, string? forwardedFor = null) =>
            SendAsync(HttpMethod.Get, path, token, forwardedFor: forwardedFor);

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await _app.StopAsync();
            await _app.DisposeAsync();
            _connection.Dispose();
        }
    }

    // ───────────────── JWT: end-to-end through the real pipeline ─────────────────

    [Fact]
    public async Task Login_IssuesTokenWithConfiguredIssuerAndAudience_AndTokenAuthorizes()
    {
        await using var api = await TestApi.StartAsync("Development");
        await api.CreateUserAsync("admin@test.local", "Admin");

        var token = await api.LoginAsync("admin@test.local");

        var parsed = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal(Issuer, parsed.Issuer);
        Assert.Equal(Audience, Assert.Single(parsed.Audiences));
        Assert.Contains(parsed.Claims, c => c.Type == ClaimTypes.Role && c.Value == "Admin");
        Assert.InRange(parsed.ValidTo, DateTime.UtcNow.AddMinutes(55), DateTime.UtcNow.AddMinutes(61));

        Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/verify/admin", token)).StatusCode);
    }

    [Fact]
    public async Task RoleAuthorization_StillWorks_WithIssuerAndAudienceValidation()
    {
        await using var api = await TestApi.StartAsync("Development");
        await api.CreateUserAsync("customer@test.local", "Customer");
        await api.CreateUserAsync("staff@test.local", "FieldStaff");
        await api.CreateUserAsync("admin@test.local", "Admin");
        var customer = await api.LoginAsync("customer@test.local");
        var staff = await api.LoginAsync("staff@test.local");
        var admin = await api.LoginAsync("admin@test.local");

        Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/verify/customer", customer)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.GetAsync("/api/verify/admin", customer)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.GetAsync("/api/verify/fieldstaff", customer)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/verify/fieldstaff", staff)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.GetAsync("/api/verify/admin", staff)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/verify/admin", admin)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.GetAsync("/api/verify/any")).StatusCode);
    }

    [Fact]
    public async Task Pipeline_RejectsTokensWithWrongIssuerAudienceOrNoClaims()
    {
        await using var api = await TestApi.StartAsync("Development");
        var future = DateTime.UtcNow.AddMinutes(10);

        Assert.Equal(HttpStatusCode.OK,
            (await api.GetAsync("/api/verify/any", MakeToken(Issuer, Audience, JwtSecret, future, "Customer"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await api.GetAsync("/api/verify/any", MakeToken("Other.Issuer", Audience, JwtSecret, future, "Customer"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await api.GetAsync("/api/verify/any", MakeToken(Issuer, "Other.Audience", JwtSecret, future, "Customer"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await api.GetAsync("/api/verify/any", MakeToken(null, null, JwtSecret, future, "Customer"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await api.GetAsync("/api/verify/any", MakeToken(Issuer, Audience, JwtSecret, DateTime.UtcNow.AddMinutes(-10), "Customer"))).StatusCode);
    }

    [Fact]
    public async Task Production_ProtectedEndpoint_AcceptsValidTokenAndRejectsWrongIssuer()
    {
        await using var api = await TestApi.StartAsync("Production");
        var valid = MakeToken(Issuer, Audience, JwtSecret, DateTime.UtcNow.AddMinutes(10), "Customer");
        var wrongIssuer = MakeToken("Other.Issuer", Audience, JwtSecret, DateTime.UtcNow.AddMinutes(10), "Customer");

        Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/orders", valid)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.GetAsync("/api/orders", wrongIssuer)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.GetAsync("/api/orders")).StatusCode);
    }

    // ───────────────────────────── Rate limiting ─────────────────────────────

    [Fact]
    public void RateLimiting_PoliciesAreAppliedToExactlyTheIntendedEndpoints()
    {
        var applied = typeof(AuthController).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t))
            .SelectMany(t =>
            {
                Assert.Empty(t.GetCustomAttributes<EnableRateLimitingAttribute>(inherit: true));
                return t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                    .SelectMany(m => m.GetCustomAttributes<EnableRateLimitingAttribute>()
                        .Select(a => $"{t.Name}.{m.Name}={a.PolicyName}"));
            })
            .OrderBy(x => x)
            .ToList();

        Assert.Equal(
            new[]
            {
                $"AuthController.Login={RateLimitPolicies.AuthLogin}",
                $"AuthController.Register={RateLimitPolicies.AuthRegister}",
                $"LeadsController.CreateLead={RateLimitPolicies.LeadsSubmit}",
            }.OrderBy(x => x),
            applied);
    }

    [Fact]
    public void RateLimiting_DocumentedLimitsMatchCommittedConfiguration()
    {
        var defaults = new RateLimitingOptions();
        Assert.Equal((10, 60), (defaults.AuthLogin.PermitLimit, defaults.AuthLogin.WindowSeconds));
        Assert.Equal((5, 60), (defaults.AuthRegister.PermitLimit, defaults.AuthRegister.WindowSeconds));
        Assert.Equal((5, 60), (defaults.LeadsSubmit.PermitLimit, defaults.LeadsSubmit.WindowSeconds));

        var apiDir = FindApiProjectDirectory();
        var committed = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(apiDir, "appsettings.json"))
            .Build()
            .GetSection(RateLimitingOptions.SectionName)
            .Get<RateLimitingOptions>()!;
        committed.Validate();
        Assert.Equal((10, 60), (committed.AuthLogin.PermitLimit, committed.AuthLogin.WindowSeconds));
        Assert.Equal((5, 60), (committed.AuthRegister.PermitLimit, committed.AuthRegister.WindowSeconds));
        Assert.Equal((5, 60), (committed.LeadsSubmit.PermitLimit, committed.LeadsSubmit.WindowSeconds));

        // Development is relaxed so manual testing never hits the limit.
        var development = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(apiDir, "appsettings.json"))
            .AddJsonFile(Path.Combine(apiDir, "appsettings.Development.json"))
            .Build()
            .GetSection(RateLimitingOptions.SectionName)
            .Get<RateLimitingOptions>()!;
        Assert.True(development.AuthLogin.PermitLimit >= 100);
        Assert.True(development.AuthRegister.PermitLimit >= 100);
        Assert.True(development.LeadsSubmit.PermitLimit >= 100);
    }

    [Fact]
    public void RateLimiting_NonPositiveLimits_FailStartupValidation()
    {
        var options = new RateLimitingOptions();
        options.AuthLogin.PermitLimit = 0;
        Assert.Contains("AuthLogin", Assert.Throws<InvalidOperationException>(options.Validate).Message);

        options = new RateLimitingOptions();
        options.LeadsSubmit.WindowSeconds = -1;
        Assert.Contains("LeadsSubmit", Assert.Throws<InvalidOperationException>(options.Validate).Message);
    }

    [Fact]
    public async Task Login_ReturnsTooManyRequests_AfterTheLimit_WithRetryAfterAndNoClientDetails()
    {
        await using var api = await TestApi.StartAsync("Production", s => s["RateLimiting:AuthLogin:PermitLimit"] = "3");

        for (var i = 0; i < 3; i++)
        {
            var allowed = await api.PostLoginAsync("nobody@test.local", "wrong-password");
            Assert.Equal(HttpStatusCode.Unauthorized, allowed.StatusCode);
        }

        var limited = await api.PostLoginAsync("nobody@test.local", "wrong-password");
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);

        var retryAfter = limited.Headers.RetryAfter?.Delta;
        Assert.NotNull(retryAfter);
        Assert.InRange(retryAfter!.Value.TotalSeconds, 1, 3600);

        Assert.Equal("application/problem+json", limited.Content.Headers.ContentType?.MediaType);
        var body = await limited.Content.ReadAsStringAsync();
        Assert.Contains("429", body);
        foreach (var leaked in new[] { "127.0.0.1", "::1", "nobody@test.local", "wrong-password", "3" + "/" })
        {
            Assert.DoesNotContain(leaked, body);
        }

        // Rejections are logged with method/path only: no address, body or credentials.
        var warning = Assert.Single(api.Logs.Entries, e => e.Category == RateLimitingSetup.LogCategory);
        Assert.Equal(LogLevel.Warning, warning.Level);
        Assert.Contains("/api/auth/login", warning.Message);
        Assert.DoesNotContain("127.0.0.1", warning.Message);
        Assert.DoesNotContain("wrong-password", warning.Message);
    }

    [Fact]
    public async Task Register_ReturnsTooManyRequests_AfterTheLimit()
    {
        await using var api = await TestApi.StartAsync("Production", s => s["RateLimiting:AuthRegister:PermitLimit"] = "2");

        Assert.Equal(HttpStatusCode.OK, (await api.PostRegisterAsync("one@test.local")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await api.PostRegisterAsync("two@test.local")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await api.PostRegisterAsync("three@test.local")).StatusCode);
    }

    [Fact]
    public async Task Leads_ReturnsTooManyRequests_AfterTheLimit_AndNormalSubmissionsSucceed()
    {
        await using var api = await TestApi.StartAsync("Production", s => s["RateLimiting:LeadsSubmit:PermitLimit"] = "2");

        Assert.Equal(HttpStatusCode.Created, (await api.PostLeadAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await api.PostLeadAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await api.PostLeadAsync()).StatusCode);
    }

    [Fact]
    public async Task Policies_AreIndependent_ExhaustingLoginDoesNotLimitLeadsOrRegister()
    {
        await using var api = await TestApi.StartAsync("Production", s => s["RateLimiting:AuthLogin:PermitLimit"] = "1");

        await api.PostLoginAsync("nobody@test.local", "x");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await api.PostLoginAsync("nobody@test.local", "x")).StatusCode);

        Assert.Equal(HttpStatusCode.Created, (await api.PostLeadAsync()).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await api.PostRegisterAsync("fresh@test.local")).StatusCode);
    }

    [Fact]
    public async Task UnrelatedEndpoints_AreNeverRateLimited()
    {
        await using var api = await TestApi.StartAsync("Development", s =>
        {
            s["RateLimiting:AuthLogin:PermitLimit"] = "1";
            s["RateLimiting:AuthRegister:PermitLimit"] = "1";
            s["RateLimiting:LeadsSubmit:PermitLimit"] = "1";
        });
        await api.CreateUserAsync("customer@test.local", "Customer");
        var token = MakeToken(Issuer, Audience, JwtSecret, DateTime.UtcNow.AddMinutes(10), "Customer");

        for (var i = 0; i < 25; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/health")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/products")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/orders", token)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await api.GetAsync("/api/verify/any", token)).StatusCode);
        }
    }

    [Fact]
    public async Task Development_IgnoresForwardedFor_SoSpoofingCannotBypassTheLimit()
    {
        await using var api = await TestApi.StartAsync("Development", s => s["RateLimiting:AuthLogin:PermitLimit"] = "2");

        Assert.Equal(HttpStatusCode.Unauthorized, (await api.PostLoginAsync("a@test.local", "x", forwardedFor: "203.0.113.1")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.PostLoginAsync("a@test.local", "x", forwardedFor: "203.0.113.2")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await api.PostLoginAsync("a@test.local", "x", forwardedFor: "203.0.113.3")).StatusCode);
    }

    [Fact]
    public async Task Production_PartitionsByClientAddressBehindTheProxy()
    {
        await using var api = await TestApi.StartAsync("Production", s => s["RateLimiting:AuthLogin:PermitLimit"] = "2");

        Assert.Equal(HttpStatusCode.Unauthorized, (await api.PostLoginAsync("a@test.local", "x", forwardedFor: "203.0.113.10")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.PostLoginAsync("a@test.local", "x", forwardedFor: "203.0.113.10")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await api.PostLoginAsync("a@test.local", "x", forwardedFor: "203.0.113.10")).StatusCode);

        // A different real client behind the same proxy is unaffected.
        Assert.Equal(HttpStatusCode.Unauthorized, (await api.PostLoginAsync("a@test.local", "x", forwardedFor: "203.0.113.11")).StatusCode);
    }

    // ───────────────────── Global exception handling + logging ─────────────────────

    [Fact]
    public async Task Production_UnexpectedException_Returns500WithGenericProblemAndTraceId()
    {
        await using var api = await TestApi.StartAsync("Production");

        var response = await api.GetAsync("/boom");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var json = JsonDocument.Parse(body);
        Assert.Equal(500, json.RootElement.GetProperty("status").GetInt32());
        Assert.Equal(SafeExceptionHandling.ClientMessage, json.RootElement.GetProperty("title").GetString());
        Assert.False(string.IsNullOrWhiteSpace(json.RootElement.GetProperty("traceId").GetString()));

        foreach (var leaked in new[]
                 {
                     "hunter2", "Server=", "Password", "SELECT", "db.internal", "C:\\", "Secret.cs",
                     nameof(InvalidOperationException), "StackTrace", "   at ", "Boom", "Microsoft.", "System.",
                 })
        {
            Assert.DoesNotContain(leaked, body);
        }
    }

    [Fact]
    public async Task Production_UnexpectedException_IsLoggedWithTheSameTraceIdAndSafeRequestContext()
    {
        await using var api = await TestApi.StartAsync("Production");
        const string headerSecret = "Bearer header-secret-value";
        const string querySecret = "query-secret-value";
        const string bodySecret = "body-secret-value";

        var response = await api.SendAsync(
            HttpMethod.Post, $"/boom?token={querySecret}",
            content: new StringContent($"{{\"password\":\"{bodySecret}\"}}", Encoding.UTF8, "application/json"),
            tweak: r => r.Headers.TryAddWithoutValidation("Authorization", headerSecret));
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var traceId = json.RootElement.GetProperty("traceId").GetString();

        var entry = Assert.Single(api.Logs.Entries, e => e.Category == SafeExceptionHandling.LogCategory);
        Assert.Equal(LogLevel.Error, entry.Level);
        Assert.IsType<InvalidOperationException>(entry.Exception);
        Assert.Equal(traceId, entry.State["TraceId"]);
        Assert.Equal("POST", entry.State["Method"]);
        Assert.Equal("/boom", entry.State["Path"]);
        Assert.Equal(500, entry.State["StatusCode"]);
        Assert.Contains(traceId!, entry.Message);

        // No header, query string or body content reaches any log line.
        foreach (var captured in api.Logs.Entries)
        {
            var text = captured.Message + " " + string.Join(" ", captured.State.Values);
            Assert.DoesNotContain("header-secret-value", text);
            Assert.DoesNotContain(querySecret, text);
            Assert.DoesNotContain(bodySecret, text);
        }
    }

    [Fact]
    public async Task Production_ErrorResponse_KeepsCorsHeadersForTheBrowserClient()
    {
        await using var api = await TestApi.StartAsync("Production");

        var response = await api.SendAsync(
            HttpMethod.Get, "/boom", tweak: r => r.Headers.Add("Origin", "http://localhost:4200"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("http://localhost:4200", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
    }

    [Fact]
    public async Task Development_UnexpectedException_StaysUsefulForDiagnostics()
    {
        await using var api = await TestApi.StartAsync("Development");

        var response = await api.SendAsync(
            HttpMethod.Get, "/boom", tweak: r => r.Headers.TryAddWithoutValidation("Accept", "text/plain"));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Contains(nameof(InvalidOperationException), body);
        Assert.Contains("hunter2", body);
    }

    [Fact]
    public async Task Production_IntentionalErrorResponses_AreUnchanged()
    {
        await using var api = await TestApi.StartAsync("Production");
        var customer = MakeToken(Issuer, Audience, JwtSecret, DateTime.UtcNow.AddMinutes(10), "Customer");

        // 400: validation problem from the controller, not replaced by the handler.
        var invalid = await api.SendAsync(HttpMethod.Post, "/api/leads", content: JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Contains("errors", await invalid.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.Unauthorized, (await api.GetAsync("/api/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await api.GetAsync("/api/admin/orders", customer)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await api.GetAsync("/no-such-route")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await api.GetAsync("/api/verify/any", customer)).StatusCode);
        Assert.DoesNotContain(api.Logs.Entries, e => e.Category == SafeExceptionHandling.LogCategory);
    }

    // ───────────────────────────── Sensitive logging ─────────────────────────────

    [Fact]
    public async Task LoginAndRegister_DoNotLogCredentialsOrTokens()
    {
        await using var api = await TestApi.StartAsync("Production");

        await api.PostRegisterAsync("logtest@test.local");
        var login = await api.PostLoginAsync("logtest@test.local", UserPassword);
        var token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
        await api.PostLoginAsync("logtest@test.local", "WrongPassword#1");
        await api.GetAsync("/api/orders", token);

        foreach (var entry in api.Logs.Entries)
        {
            var text = entry.Message + " " + string.Join(" ", entry.State.Values) + " " + entry.Exception;
            Assert.DoesNotContain(UserPassword, text);
            Assert.DoesNotContain("WrongPassword#1", text);
            Assert.DoesNotContain(token, text);
            Assert.DoesNotContain(JwtSecret, text);
        }
    }

    [Fact]
    public void ApplicationCode_HasNoSensitiveLoggingPatterns()
    {
        var apiDir = FindApiProjectDirectory();
        var sources = Directory.EnumerateFiles(apiDir, "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                     && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}")
                     && !f.Contains($"{Path.DirectorySeparatorChar}Migrations{Path.DirectorySeparatorChar}"))
            .ToList();
        Assert.NotEmpty(sources);

        foreach (var file in sources)
        {
            var text = File.ReadAllText(file);
            Assert.DoesNotContain("EnableSensitiveDataLogging", text);
            Assert.DoesNotContain("Console.Write", text);
            Assert.DoesNotContain("UseDeveloperExceptionPage", text);
        }

        // The only application log statements are the two safe ones.
        var logCalls = sources
            .Where(f => File.ReadAllText(f).Contains("logger.Log"))
            .Select(Path.GetFileName)
            .OrderBy(x => x)
            .ToList();
        Assert.Equal(new[] { "RateLimitingSetup.cs", "SafeExceptionHandling.cs" }, logCalls);
    }

    private static string FindApiProjectDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "InteriorPlatform.Api", "appsettings.json");
            if (File.Exists(candidate))
            {
                return Path.GetDirectoryName(candidate)!;
            }

            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException("InteriorPlatform.Api project directory not found.");
    }
}
