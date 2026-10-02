namespace InteriorPlatform.Api.Services;

/// <summary>
/// Application abstraction over the Razorpay TEST-mode orders API. Keeps all
/// provider-specific HTTP/SDK logic out of controllers and makes payment
/// flows unit-testable without network access. The only dependency added for
/// Razorpay is <see cref="HttpClient"/> via IHttpClientFactory — no vendor
/// SDK (the official Razorpay .NET SDK targets legacy .NET Framework and is
/// unsuitable for .NET 10).
/// </summary>
public interface IRazorpayPaymentGateway
{
    /// <summary>
    /// Configured Razorpay test-mode Key ID (empty when unconfigured). Safe
    /// for Checkout responses; the secret is never exposed through this
    /// abstraction.
    /// </summary>
    string KeyId { get; }

    /// <summary>
    /// Creates a TEST-mode provider order for an exact smallest-unit amount.
    /// Throws <see cref="InvalidOperationException"/> when credentials are
    /// missing and <see cref="RazorpayGatewayException"/> when the provider
    /// rejects the request or cannot be reached.
    /// </summary>
    Task<RazorpayOrderResult> CreateOrderAsync(
        long amountPaise,
        string currency,
        string receipt,
        CancellationToken cancellationToken = default);
}
