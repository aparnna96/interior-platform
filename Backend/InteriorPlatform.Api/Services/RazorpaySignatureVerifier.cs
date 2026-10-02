using System.Security.Cryptography;
using System.Text;

namespace InteriorPlatform.Api.Services;

/// <summary>
/// Server-side Razorpay payment signature verification, per the official
/// Razorpay requirement: HMAC-SHA256 over
/// <c>razorpay_order_id + "|" + razorpay_payment_id</c> keyed with the Key
/// Secret, hex-encoded and compared in constant time against
/// <c>razorpay_signature</c>. Never implemented client-side.
/// </summary>
public static class RazorpaySignatureVerifier
{
    /// <summary>
    /// Computes the expected hex signature for the given ids and secret.
    /// Exposed for tests so they can mint valid signatures with a
    /// deterministic test-only secret.
    /// </summary>
    public static string Compute(string keySecret, string orderId, string paymentId)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(keySecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{orderId}|{paymentId}"));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>
    /// Returns true only when the supplied signature matches the expected
    /// HMAC. Any missing input or malformed signature fails closed (false).
    /// </summary>
    public static bool Verify(string keySecret, string orderId, string paymentId, string signature)
    {
        if (string.IsNullOrEmpty(keySecret)
            || string.IsNullOrEmpty(orderId)
            || string.IsNullOrEmpty(paymentId)
            || string.IsNullOrEmpty(signature))
        {
            return false;
        }

        byte[] provided;
        try
        {
            provided = Convert.FromHexString(signature);
        }
        catch (FormatException)
        {
            return false;
        }

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(keySecret));
        var expected = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{orderId}|{paymentId}"));
        return CryptographicOperations.FixedTimeEquals(expected, provided);
    }
}
