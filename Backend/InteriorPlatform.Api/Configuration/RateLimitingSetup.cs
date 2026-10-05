using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Threading.RateLimiting;

namespace InteriorPlatform.Api.Configuration;

/// <summary>Names of the rate-limit policies applied with [EnableRateLimiting].</summary>
public static class RateLimitPolicies
{
    public const string AuthLogin = "auth-login";
    public const string AuthRegister = "auth-register";
    public const string LeadsSubmit = "leads-submit";
}

/// <summary>
/// One fixed-window limit: at most <see cref="PermitLimit"/> requests per
/// <see cref="WindowSeconds"/> seconds, per client address.
/// </summary>
public sealed class RateLimitPolicyOptions
{
    public int PermitLimit { get; set; }

    public int WindowSeconds { get; set; }
}

/// <summary>
/// Configuration section "RateLimiting". Only anonymous, abuse-prone writes
/// are limited; reads (products, cart, orders, estimates, proposals, admin
/// workspaces) are deliberately NOT limited. The defaults below are the
/// production values (appsettings.json repeats them for visibility;
/// appsettings.Development.json relaxes them so local testing stays easy):
/// <list type="bullet">
/// <item>POST /api/auth/login    - 10 requests / 60 s per client IP (slows password guessing)</item>
/// <item>POST /api/auth/register - 5 requests / 60 s per client IP</item>
/// <item>POST /api/leads         - 5 requests / 60 s per client IP (enquiry form spam)</item>
/// </list>
/// </summary>
public sealed class RateLimitingOptions
{
    public const string SectionName = "RateLimiting";

    public RateLimitPolicyOptions AuthLogin { get; set; } = new() { PermitLimit = 10, WindowSeconds = 60 };

    public RateLimitPolicyOptions AuthRegister { get; set; } = new() { PermitLimit = 5, WindowSeconds = 60 };

    public RateLimitPolicyOptions LeadsSubmit { get; set; } = new() { PermitLimit = 5, WindowSeconds = 60 };

    /// <summary>Fails startup on non-positive limits instead of locking everyone out.</summary>
    public void Validate()
    {
        Validate(nameof(AuthLogin), AuthLogin);
        Validate(nameof(AuthRegister), AuthRegister);
        Validate(nameof(LeadsSubmit), LeadsSubmit);
    }

    private static void Validate(string name, RateLimitPolicyOptions policy)
    {
        if (policy is null || policy.PermitLimit <= 0 || policy.WindowSeconds <= 0)
        {
            throw new InvalidOperationException(
                $"{SectionName}:{name} must define a positive PermitLimit and WindowSeconds.");
        }
    }
}

/// <summary>Built-in ASP.NET Core rate limiting (no third-party package).</summary>
public static class RateLimitingSetup
{
    /// <summary>Logger category for rejected (429) requests.</summary>
    public const string LogCategory = "InteriorPlatform.Api.RateLimiting";

    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var options = configuration.GetSection(RateLimitingOptions.SectionName).Get<RateLimitingOptions>()
            ?? new RateLimitingOptions();
        options.Validate();

        return services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            limiter.OnRejected = WriteRejectionAsync;

            AddPerClientPolicy(limiter, RateLimitPolicies.AuthLogin, options.AuthLogin);
            AddPerClientPolicy(limiter, RateLimitPolicies.AuthRegister, options.AuthRegister);
            AddPerClientPolicy(limiter, RateLimitPolicies.LeadsSubmit, options.LeadsSubmit);
        });
    }

    private static void AddPerClientPolicy(RateLimiterOptions limiter, string name, RateLimitPolicyOptions policy) =>
        limiter.AddPolicy(name, context => RateLimitPartition.GetFixedWindowLimiter(
            ClientKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = policy.PermitLimit,
                Window = TimeSpan.FromSeconds(policy.WindowSeconds),
                QueueLimit = 0,
                AutoReplenishment = true,
            }));

    /// <summary>
    /// Partitions by the connection's remote address only. Outside
    /// Development that address has already been resolved from the proxy's
    /// X-Forwarded-For by the forwarded-headers middleware; no other
    /// client-supplied identity header is consulted, and no user identity is
    /// involved.
    /// </summary>
    private static string ClientKey(HttpContext context)
    {
        var address = context.Connection.RemoteIpAddress;
        if (address is null)
        {
            return "unknown";
        }

        return (address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address).ToString();
    }

    private static async ValueTask WriteRejectionAsync(OnRejectedContext context, CancellationToken cancellationToken)
    {
        var response = context.HttpContext.Response;
        response.StatusCode = StatusCodes.Status429TooManyRequests;

        // Method and path only: no client address, headers or body, so the
        // log line carries no personal data, credentials or tokens.
        var logger = context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger(LogCategory);
        logger.LogWarning(
            "Rate limit exceeded for {Method} {Path}",
            context.HttpContext.Request.Method,
            context.HttpContext.Request.Path.Value);

        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            var seconds = Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds));
            response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
        }

        // Generic body only: no client address, no user data, no limits.
        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "Too many requests. Please try again later.",
        };
        await response.WriteAsJsonAsync(problem, (JsonSerializerOptions?)null, "application/problem+json", cancellationToken);
    }
}
