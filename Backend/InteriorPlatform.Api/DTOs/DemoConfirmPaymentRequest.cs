namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Request body for POST /api/payments/demo/confirm (Payments:Mode=Demo
/// only). Carries just our local payment id: amount, ownership, provider and
/// outcome are all derived from persisted state and configuration.
/// </summary>
public class DemoConfirmPaymentRequest
{
    /// <summary>Our local payment record id (a demo payment).</summary>
    public Guid PaymentId { get; set; }
}
