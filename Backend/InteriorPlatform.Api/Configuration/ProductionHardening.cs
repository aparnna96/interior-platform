using InteriorPlatform.Api.Controllers;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;

namespace InteriorPlatform.Api.Configuration;

/// <summary>
/// Small, testable pieces of startup wiring that keep development-only
/// behaviour out of Production. Program.cs calls these; they hold no
/// business logic and read no secrets.
/// </summary>
public static class ProductionHardening
{
    /// <summary>Public liveness probe path. Exposes no diagnostics.</summary>
    public const string HealthPath = "/health";

    /// <summary>
    /// Removes development-only controllers (currently /api/verify/*) from
    /// routing outside Development, so they answer 404 in Production.
    /// </summary>
    public static void HideDevelopmentOnlyControllers(this MvcOptions options, IHostEnvironment environment)
    {
        if (!environment.IsDevelopment())
        {
            options.Conventions.Add(new HideVerifyControllerOutsideDevelopmentConvention());
        }
    }

    /// <summary>
    /// Outside Development the API normally sits behind a TLS-terminating
    /// reverse proxy, so the app itself sees plain HTTP and every client
    /// appears to connect from the proxy's address. Honour X-Forwarded-Proto
    /// (so <c>Request.Scheme</c> reflects the client's scheme and HTTPS
    /// redirection cannot loop) and X-Forwarded-For (so per-client rate
    /// limiting sees the real client instead of one shared proxy address).
    /// ForwardLimit stays 1: only the entry appended by the nearest proxy is
    /// used, so extra values a client prepends are ignored. Known proxies
    /// cannot be enumerated on cloud hosts, so the allow-lists are cleared;
    /// this assumes the API is only reachable through that proxy. If it were
    /// exposed directly, a client could spoof its address and dodge the rate
    /// limit (configure KnownProxies in that case). Development keeps the
    /// framework default (headers ignored).
    /// </summary>
    public static IServiceCollection AddProxyHeaderHandling(this IServiceCollection services, IHostEnvironment environment)
    {
        if (environment.IsDevelopment())
        {
            return services;
        }

        return services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor;
            options.ForwardLimit = 1;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });
    }

    /// <summary>
    /// HTTPS redirection for everything except the health probe, so a
    /// platform probe over plain HTTP is never redirected.
    /// </summary>
    public static IApplicationBuilder UseHttpsRedirectionExceptHealth(this IApplicationBuilder app) =>
        app.UseWhen(
            context => !context.Request.Path.Equals(HealthPath, StringComparison.OrdinalIgnoreCase),
            branch => branch.UseHttpsRedirection());

    /// <summary>
    /// Registers OpenAPI document generation. The document is only ever
    /// served in Development (see <see cref="MapDevelopmentOnlyEndpoints"/>).
    /// </summary>
    public static IServiceCollection AddApiOpenApi(this IServiceCollection services) =>
        services.AddOpenApi();

    /// <summary>
    /// Maps endpoints that exist only in Development (OpenAPI document).
    /// Nothing is mapped in any other environment.
    /// </summary>
    public static WebApplication MapDevelopmentOnlyEndpoints(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        return app;
    }

    /// <summary>
    /// GET /health — anonymous liveness only. Returns a constant body: no
    /// configuration, connection strings, environment or user data, and no
    /// database check.
    /// </summary>
    public static IEndpointConventionBuilder MapHealth(this IEndpointRouteBuilder endpoints) =>
        endpoints
            .MapGet(HealthPath, () => Results.Ok(new { status = "Healthy" }))
            .AllowAnonymous();
}
