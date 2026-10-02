namespace InteriorPlatform.Api.Services;

/// <summary>
/// Result of a provider-side test-mode order creation.
/// </summary>
/// <param name="OrderId">Provider order id (Razorpay order id).</param>
/// <param name="AmountPaise">Order amount in the smallest currency unit.</param>
/// <param name="Currency">ISO currency code echoed by the provider.</param>
public sealed record RazorpayOrderResult(string OrderId, long AmountPaise, string Currency);
