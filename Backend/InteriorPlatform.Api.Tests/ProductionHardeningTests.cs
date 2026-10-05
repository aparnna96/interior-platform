using InteriorPlatform.Api.Configuration;
using InteriorPlatform.Api.Controllers;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using System.Net;
using System.Text;
using Xunit;

namespace InteriorPlatform.Api.Tests;

/// <summary>
/// Production hardening (Task 17A). The hardening wiring lives in
/// <see cref="ProductionHardening"/> and is exercised here on a real Kestrel
/// host (loopback, ephemeral port) built per environment, using the real
/// controllers' routing. No database or external service is touched: the
/// endpoints under test (verify, health, openapi, redirects) never reach
/// the DbContext.
/// </summary>
public sealed class ProductionHardeningTests
{
    private const string SentinelSecret = "sentinel-config-value-do-not-leak";

    private sealed class TestHost : IAsyncDisposable
    {
        private readonly WebApplication _app;

        public HttpClient Client { get; }

        private TestHost(WebApplication app, HttpClient client)
        {
            _app = app;
            Client = client;
        }

        public static async Task<TestHost> StartAsync(string environment, int? httpsPort = null)
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = environment,
            });
            builder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0));
            builder.Logging.ClearProviders();

            // Secrets present in configuration must never appear in responses.
            builder.Configuration["Jwt:Secret"] = SentinelSecret;
            builder.Configuration["ConnectionStrings:DefaultConnection"] = $"Server=x;Password={SentinelSecret}";
            builder.Configuration["Razorpay:KeySecret"] = SentinelSecret;
            if (httpsPort is not null)
            {
                builder.Configuration["HTTPS_PORT"] = httpsPort.Value.ToString();
            }

            builder.Services.AddApiOpenApi();
            builder.Services
                .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(o => o.TokenValidationParameters = new TokenValidationParameters
                {
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(new string('k', 32))),
                    ValidateIssuer = false,
                    ValidateAudience = false,
                });
            builder.Services.AddAuthorization();
            builder.Services
                .AddControllers(o => o.HideDevelopmentOnlyControllers(builder.Environment))
                .AddApplicationPart(typeof(VerifyController).Assembly);
            builder.Services.AddProxyHeaderHandling(builder.Environment);

            var app = builder.Build();
            app.UseForwardedHeaders();
            app.MapDevelopmentOnlyEndpoints();
            app.UseHttpsRedirectionExceptHealth();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapControllers();
            app.MapHealth();
            await app.StartAsync();

            var address = app.Services.GetRequiredService<IServer>()
                .Features.Get<IServerAddressesFeature>()!.Addresses.First();
            var handler = new HttpClientHandler { AllowAutoRedirect = false };
            var client = new HttpClient(handler) { BaseAddress = new Uri(address) };
            return new TestHost(app, client);
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await _app.StopAsync();
            await _app.DisposeAsync();
        }
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Development")]
    public async Task WeatherForecast_IsUnavailableInEveryEnvironment(string environment)
    {
        await using var host = await TestHost.StartAsync(environment);
        var response = await host.Client.GetAsync("/weatherforecast");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public void WeatherForecast_TypesAndFilesAreRemoved()
    {
        var types = typeof(VerifyController).Assembly.GetTypes();
        Assert.DoesNotContain(types, t => t.Name.Contains("WeatherForecast", StringComparison.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData("any")]
    [InlineData("customer")]
    [InlineData("fieldstaff")]
    [InlineData("admin")]
    public async Task Verify_Endpoints_Return404InProduction(string action)
    {
        await using var host = await TestHost.StartAsync("Production");
        var response = await host.Client.GetAsync($"/api/verify/{action}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("Staging")]
    [InlineData("Test")]
    public async Task Verify_Endpoints_AreUnavailableOutsideDevelopment(string environment)
    {
        await using var host = await TestHost.StartAsync(environment);
        var response = await host.Client.GetAsync("/api/verify/any");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("any")]
    [InlineData("customer")]
    [InlineData("fieldstaff")]
    [InlineData("admin")]
    public async Task Verify_Endpoints_StayRoutedAndProtectedInDevelopment(string action)
    {
        await using var host = await TestHost.StartAsync("Development");
        var response = await host.Client.GetAsync($"/api/verify/{action}");
        // Routed (not 404) and still protected by [Authorize].
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task OpenApi_IsAvailableInDevelopment()
    {
        await using var host = await TestHost.StartAsync("Development");
        var response = await host.Client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("/openapi/v1.json")]
    [InlineData("/swagger")]
    [InlineData("/swagger/index.html")]
    public async Task OpenApiAndSwagger_AreNotExposedInProduction(string path)
    {
        await using var host = await TestHost.StartAsync("Production");
        var response = await host.Client.GetAsync(path);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Development")]
    public async Task Health_Returns200AnonymouslyWithoutSensitiveData(string environment)
    {
        await using var host = await TestHost.StartAsync(environment);
        var response = await host.Client.GetAsync("/health");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("""{"status":"Healthy"}""", body);
        Assert.DoesNotContain(SentinelSecret, body);
        foreach (var banned in new[] { "Server=", "Password", "Secret", "ConnectionString", "Jwt", "Razorpay", "Environment" })
        {
            Assert.DoesNotContain(banned, body, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Health_IsNotRedirectedToHttps()
    {
        await using var host = await TestHost.StartAsync("Production", httpsPort: 443);
        var response = await host.Client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Production_RedirectsPlainHttpToHttps()
    {
        await using var host = await TestHost.StartAsync("Production", httpsPort: 443);
        var response = await host.Client.GetAsync("/api/verify/any");
        Assert.Equal(HttpStatusCode.TemporaryRedirect, response.StatusCode);
        Assert.Equal("https", response.Headers.Location?.Scheme);
    }

    [Fact]
    public async Task Production_TrustsForwardedProto_SoProxyTerminatedTlsDoesNotLoop()
    {
        await using var host = await TestHost.StartAsync("Production", httpsPort: 443);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/verify/any");
        request.Headers.Add("X-Forwarded-Proto", "https");
        var response = await host.Client.SendAsync(request);
        // Not redirected again: the request is treated as already HTTPS
        // (route is hidden in Production, hence 404 rather than a redirect).
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Fact]
    public async Task Development_IgnoresForwardedHeaders()
    {
        await using var host = await TestHost.StartAsync("Development", httpsPort: 443);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/verify/any");
        request.Headers.Add("X-Forwarded-Proto", "https");
        var response = await host.Client.SendAsync(request);
        // Framework default in Development: the header is not honoured, so
        // plain HTTP is still redirected.
        Assert.Equal(HttpStatusCode.TemporaryRedirect, response.StatusCode);
    }

    [Fact]
    public async Task LegitimateProductionEndpoints_AreStillRouted()
    {
        await using var host = await TestHost.StartAsync("Production");
        // Routed and protected (401), not removed (404).
        foreach (var path in new[] { "/api/admin/orders", "/api/admin/proposals", "/api/orders", "/api/proposals", "/api/cart" })
        {
            var response = await host.Client.GetAsync(path);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    [Fact]
    public void ProductionSettings_ContainNoConnectionStringOrCredentials()
    {
        var apiDir = FindApiProjectDirectory();
        foreach (var file in new[] { "appsettings.json", "appsettings.Production.json" })
        {
            var text = File.ReadAllText(Path.Combine(apiDir, file));
            Assert.DoesNotContain("SQLEXPRESS", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("ConnectionStrings", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Trusted_Connection", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("Password=", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("rzp_", text, StringComparison.OrdinalIgnoreCase);
            // Issuer/audience are non-secret config; the signing secret never is.
            Assert.DoesNotContain("\"Secret\"", text, StringComparison.OrdinalIgnoreCase);
        }

        // Production must not ship usable issuer/audience values: they are
        // placeholders a deployment has to override deliberately.
        using var jwt = System.Text.Json.JsonDocument.Parse(
            File.ReadAllText(Path.Combine(apiDir, "appsettings.Production.json")));
        var jwtSection = jwt.RootElement.GetProperty("Jwt");
        Assert.StartsWith("REPLACE_WITH_", jwtSection.GetProperty("Issuer").GetString());
        Assert.StartsWith("REPLACE_WITH_", jwtSection.GetProperty("Audience").GetString());

        using var production = System.Text.Json.JsonDocument.Parse(
            File.ReadAllText(Path.Combine(apiDir, "appsettings.Production.json")));
        var razorpay = production.RootElement.GetProperty("Razorpay");
        Assert.Equal(string.Empty, razorpay.GetProperty("KeyId").GetString());
        Assert.Equal(string.Empty, razorpay.GetProperty("KeySecret").GetString());
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
