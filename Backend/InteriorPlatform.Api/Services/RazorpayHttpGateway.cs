using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Serialization;
using InteriorPlatform.Api.Configuration;
using Microsoft.Extensions.Options;

namespace InteriorPlatform.Api.Services;

/// <summary>
/// <see cref="IRazorpayPaymentGateway"/> over plain HTTPS
/// (<c>POST https://api.razorpay.com/v1/orders</c>, Basic auth with the
/// test-mode Key ID/Secret). No vendor SDK is referenced. The secret travels
/// only in the Authorization header to Razorpay over HTTPS: it is never
/// logged and never returned to callers.
/// </summary>
public sealed class RazorpayHttpGateway : IRazorpayPaymentGateway
{
    private readonly HttpClient _http;
    private readonly IOptions<RazorpayOptions> _options;

    public RazorpayHttpGateway(HttpClient http, IOptions<RazorpayOptions> options)
    {
        _http = http;
        _options = options;
    }

    public string KeyId => _options.Value.KeyId ?? string.Empty;

    public async Task<RazorpayOrderResult> CreateOrderAsync(
        long amountPaise,
        string currency,
        string receipt,
        CancellationToken cancellationToken = default)
    {
        var keyId = _options.Value.KeyId;
        var keySecret = _options.Value.KeySecret;
        if (string.IsNullOrWhiteSpace(keyId) || string.IsNullOrWhiteSpace(keySecret))
        {
            throw new InvalidOperationException(
                "Razorpay is not configured. Provide Razorpay:KeyId and Razorpay:KeySecret via User Secrets or environment variables.");
        }

        if (amountPaise <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(amountPaise), "The provider order amount must be positive.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "orders");
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{keyId}:{keySecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
        request.Content = JsonContent.Create(new
        {
            amount = amountPaise,
            currency,
            receipt,
        });

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, cancellationToken);
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            throw new RazorpayGatewayException("Could not reach the Razorpay orders API.", ex);
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new RazorpayGatewayException(
                $"Razorpay rejected the order request (HTTP {(int)response.StatusCode}).");
        }

        var payload = await response.Content.ReadFromJsonAsync<RazorpayOrderPayload>(cancellationToken);
        if (payload is null || string.IsNullOrWhiteSpace(payload.Id))
        {
            throw new RazorpayGatewayException("Razorpay returned an invalid order response.");
        }

        return new RazorpayOrderResult(payload.Id, payload.Amount, payload.Currency ?? currency);
    }

    private sealed record RazorpayOrderPayload(
        [property: JsonPropertyName("id")] string? Id,
        [property: JsonPropertyName("amount")] long Amount,
        [property: JsonPropertyName("currency")] string? Currency);
}
