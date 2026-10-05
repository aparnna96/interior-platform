using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Text.Json;

namespace InteriorPlatform.Api.Configuration;

/// <summary>
/// Minimal global exception handling for non-Development environments,
/// built on the framework's exception-handler middleware. Clients get a
/// generic ProblemDetails 500 with only a trace identifier; the exception
/// itself (type, message, stack) is logged server-side under that same
/// identifier. Development keeps the framework's developer exception page,
/// which WebApplication adds automatically. Intentional 400/401/403/404/409
/// responses never throw, so they are unaffected.
/// </summary>
public static class SafeExceptionHandling
{
    /// <summary>Logger category for unexpected exceptions.</summary>
    public const string LogCategory = "InteriorPlatform.Api.UnhandledExceptions";

    /// <summary>The only message clients ever see for unexpected errors.</summary>
    public const string ClientMessage = "An unexpected error occurred.";

    /// <param name="corsPolicyName">
    /// CORS policy to re-apply to the error response. The exception-handler
    /// middleware clears response headers, which would otherwise strip the
    /// CORS headers and make the 500 unreadable to the browser client.
    /// </param>
    public static WebApplication UseSafeExceptionHandling(this WebApplication app, string? corsPolicyName = null)
    {
        if (app.Environment.IsDevelopment())
        {
            return app;
        }

        app.UseExceptionHandler(new ExceptionHandlerOptions
        {
            ExceptionHandler = context => HandleAsync(context, corsPolicyName),
        });
        return app;
    }

    private static async Task HandleAsync(HttpContext context, string? corsPolicyName)
    {
        // Same identifier ASP.NET Core puts in its own ProblemDetails
        // ("traceId"); it is also written to the log entry below.
        var traceId = Activity.Current?.Id ?? context.TraceIdentifier;

        var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
        if (exception is not null)
        {
            // Method/path/status only: never headers, query string or body
            // (so no tokens, passwords, signatures or payment data).
            var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger(LogCategory);
            logger.LogError(
                exception,
                "Unhandled exception while processing {Method} {Path}; responding {StatusCode}. TraceId: {TraceId}",
                context.Request.Method,
                context.Request.Path.Value,
                StatusCodes.Status500InternalServerError,
                traceId);
        }

        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await ApplyCorsAsync(context, corsPolicyName);

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = ClientMessage,
            Type = "https://tools.ietf.org/html/rfc9110#section-15.6.1",
        };
        problem.Extensions["traceId"] = traceId;

        await context.Response.WriteAsJsonAsync(problem, (JsonSerializerOptions?)null, "application/problem+json");
    }

    private static async Task ApplyCorsAsync(HttpContext context, string? corsPolicyName)
    {
        if (corsPolicyName is null)
        {
            return;
        }

        var provider = context.RequestServices.GetService<ICorsPolicyProvider>();
        var service = context.RequestServices.GetService<ICorsService>();
        if (provider is null || service is null)
        {
            return;
        }

        var policy = await provider.GetPolicyAsync(context, corsPolicyName);
        if (policy is not null)
        {
            service.ApplyResult(service.EvaluatePolicy(context, policy), context.Response);
        }
    }
}
