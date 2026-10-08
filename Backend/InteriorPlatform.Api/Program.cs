using InteriorPlatform.Api.Configuration;
using InteriorPlatform.Api.Controllers;
using InteriorPlatform.Api.Data;
using InteriorPlatform.Api.Models;
using InteriorPlatform.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddApiOpenApi();

// The connection string has no committed default outside Development: it must
// come from User Secrets or the ConnectionStrings__DefaultConnection
// environment variable. Fail fast with a clear message instead of a vague
// provider error at the first database call.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not configured. Set it via User Secrets or the ConnectionStrings__DefaultConnection environment variable.");
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(connectionString));

builder.Services.AddIdentity<ApplicationUser, IdentityRole>()
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddDefaultTokenProviders();

// JWT secret, issuer and audience are all required and validated at startup
// (values are never logged or echoed). The same JwtSettings instance signs
// tokens at login and validates them here, so they cannot drift apart.
// Signature, issuer, audience and lifetime are all validated.
var jwtSettings = JwtSettings.Load(builder.Configuration);
builder.Services.AddSingleton(jwtSettings);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = jwtSettings.CreateValidationParameters();
});

// Built-in rate limiting for anonymous, abuse-prone writes only
// (login, register, lead submission). See RateLimitingOptions for the limits.
builder.Services.AddApiRateLimiting(builder.Configuration);
builder.Services.AddAuthorization();

// VerifyController exposes JWT/role diagnostics for development use only.
// Outside Development its actions are removed from routing, so /api/verify/*
// is unavailable (404) in Production. Real authorization behavior elsewhere
// is unchanged.
builder.Services.AddControllers(options =>
        options.HideDevelopmentOnlyControllers(builder.Environment))
    // Timestamps are stored as UTC; make the JSON say so (trailing "Z").
    .AddUtcDateTimes();

// Behind a TLS-terminating proxy (Production) honour X-Forwarded-Proto so
// HTTPS redirection cannot loop. No effect in Development.
builder.Services.AddProxyHeaderHandling(builder.Environment);

// CORS origins are configuration-driven (Cors:AllowedOrigins) so each
// environment declares its own frontend origin(s) explicitly — no wildcard,
// no AllowAnyOrigin. JWT travels in the Authorization header, so no
// credentials are required.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
if (allowedOrigins is null || allowedOrigins.Length == 0)
{
    throw new InvalidOperationException("Cors:AllowedOrigins is not configured. Set it via appsettings.{Environment}.json or environment configuration.");
}

var normalizedOrigins = allowedOrigins.Select(o => (o ?? string.Empty).Trim().TrimEnd('/')).ToArray();
foreach (var origin in normalizedOrigins)
{
    if (string.IsNullOrWhiteSpace(origin)
        || origin.Contains('*')
        || !Uri.TryCreate(origin, UriKind.Absolute, out var uri)
        || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
    {
        throw new InvalidOperationException($"Cors:AllowedOrigins contains an invalid origin: '{origin}'. Each origin must be an absolute HTTP/HTTPS origin without wildcards (e.g. 'https://example.com').");
    }
}

// Bootstrap estimate rate (Estimates:DemoRatePerSquareFoot). Since the Rate
// Master exists this value is only used to seed the first rate when the
// EstimateRates table is empty; after that Admins manage the rate in the app.
// Fail fast when it is missing or not positive.
builder.Services.Configure<EstimateOptions>(
    builder.Configuration.GetSection(EstimateOptions.SectionName));
var estimateRate = builder.Configuration.GetValue<decimal?>("Estimates:DemoRatePerSquareFoot");
if (estimateRate is null || estimateRate <= 0)
{
    throw new InvalidOperationException("Estimates:DemoRatePerSquareFoot must be a positive value. Set it via appsettings.{Environment}.json or environment configuration.");
}

// Token payment settings (Payments:TokenAmount / Payments:Currency). The
// amount is a development/test default only — not an official company
// business rule — but the backend must own it, so startup fails explicitly
// when it is missing or not positive. Currency falls back to INR only when
// the key is absent; an explicitly empty value is a configuration error.
builder.Services.Configure<PaymentsOptions>(
    builder.Configuration.GetSection(PaymentsOptions.SectionName));
var tokenAmount = builder.Configuration.GetValue<decimal?>("Payments:TokenAmount");
if (tokenAmount is null || tokenAmount <= 0)
{
    throw new InvalidOperationException("Payments:TokenAmount must be a positive value. Set it via appsettings.{Environment}.json or environment configuration.");
}
var paymentsCurrency = builder.Configuration.GetValue<string>("Payments:Currency");
if (paymentsCurrency is not null && string.IsNullOrWhiteSpace(paymentsCurrency))
{
    throw new InvalidOperationException("Payments:Currency must be a non-empty value (e.g. \"INR\") or be omitted to default to INR.");
}

// Payments:Mode selects the gateway: "Razorpay" (default) or "Demo". Demo is a
// deliberate opt-in for internship/demo deployments (no external gateway); any
// other value is a configuration error so a typo can never silently change
// how the paywall behaves.
var paymentsMode = builder.Configuration.GetValue<string>("Payments:Mode");
if (paymentsMode is not null && !PaymentsOptions.IsValidMode(paymentsMode))
{
    throw new InvalidOperationException("Payments:Mode must be \"Razorpay\" or \"Demo\", or be omitted to default to Razorpay.");
}

// Razorpay TEST-mode credentials (Razorpay:KeyId / Razorpay:KeySecret) come
// from User Secrets or environment variables — never from source control.
// They are intentionally NOT validated at startup: a missing credential must
// fail payment operations with a clear error, not prevent the whole
// application (or tooling such as EF commands) from starting.
builder.Services.Configure<RazorpayOptions>(
    builder.Configuration.GetSection(RazorpayOptions.SectionName));

// Direct HTTPS integration with the Razorpay TEST-mode orders API (no vendor
// SDK). The typed client carries only the base address; credentials travel
// per-request in the Authorization header inside the gateway.
builder.Services.AddHttpClient<IRazorpayPaymentGateway, RazorpayHttpGateway>(
    client => client.BaseAddress = new Uri("https://api.razorpay.com/v1/"));

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(normalizedOrigins)
            .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE")
            .WithHeaders("Content-Type", "Authorization");
    });
});

var app = builder.Build();

if (PaymentsOptions.IsValidMode(paymentsMode) &&
    string.Equals(paymentsMode, PaymentsOptions.DemoMode, StringComparison.OrdinalIgnoreCase))
{
    app.Logger.LogWarning(
        "Payments:Mode is Demo: token payments are simulated and the proposal PDF unlocks without a real charge.");
}

// Apply pending EF Core migrations before seeding so a fresh production
// database has the required schema. If migration fails, startup fails
// explicitly instead of continuing with seeding.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await db.Database.MigrateAsync();
}

// Seed application roles (Customer, FieldStaff, Admin). Idempotent.
using (var scope = app.Services.CreateScope())
{
    await RoleSeeder.SeedAsync(scope.ServiceProvider);
}

// Seed catalogue products from the Angular catalogue. Idempotent.
using (var scope = app.Services.CreateScope())
{
    await ProductSeeder.SeedAsync(scope.ServiceProvider);
}

// Seed the first estimate rate from Estimates:DemoRatePerSquareFoot. Only runs
// when the Rate Master table is empty, so an Admin-set rate is never touched.
using (var scope = app.Services.CreateScope())
{
    await EstimateRateSeeder.SeedAsync(scope.ServiceProvider);
}

// Configure the HTTP request pipeline.
// Forwarded headers first so later middleware sees the client's scheme.
app.UseForwardedHeaders();

// Unexpected exceptions become a generic 500 (Production); Development keeps
// the developer exception page. Runs early so it covers the whole pipeline.
app.UseSafeExceptionHandling("Frontend");

// OpenAPI is mapped in Development only.
app.MapDevelopmentOnlyEndpoints();

app.UseHttpsRedirectionExceptHealth();

// CORS must run before authentication/authorization so controller
// endpoints and preflight (OPTIONS) requests are handled correctly.
app.UseCors("Frontend");

// Before authentication so password-guessing floods are rejected cheaply.
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Anonymous liveness probe (no diagnostics, no database check).
app.MapHealth();

app.Run();
