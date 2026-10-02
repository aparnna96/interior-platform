namespace InteriorPlatform.Api.Services;

/// <summary>
/// Thrown when the Razorpay TEST-mode API rejects an order request, returns
/// an unusable payload, or cannot be reached. Messages never contain API
/// credentials.
/// </summary>
public sealed class RazorpayGatewayException : Exception
{
    public RazorpayGatewayException(string message)
        : base(message)
    {
    }

    public RazorpayGatewayException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
