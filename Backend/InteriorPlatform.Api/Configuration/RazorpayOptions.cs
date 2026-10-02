namespace InteriorPlatform.Api.Configuration;

/// <summary>
/// Razorpay TEST-mode credentials bound from the "Razorpay" configuration
/// section. Values must come from User Secrets or environment variables —
/// never from source code, appsettings files, tests, or Git. The secret is
/// used only server-side for order creation (Basic auth) and payment
/// signature verification; it is never logged and never sent to clients.
/// Missing credentials do not prevent application startup: payment
/// operations fail with a clear configuration error instead.
/// </summary>
public sealed class RazorpayOptions
{
    public const string SectionName = "Razorpay";

    /// <summary>
    /// Razorpay test-mode Key ID. Safe to expose to Checkout via the
    /// payment-creation response (Razorpay requires it client-side).
    /// </summary>
    public string KeyId { get; set; } = string.Empty;

    /// <summary>
    /// Razorpay test-mode Key Secret. Server-only: used for API
    /// authentication and HMAC signature verification. Never expose it.
    /// </summary>
    public string KeySecret { get; set; } = string.Empty;
}
