namespace InteriorPlatform.Api.Configuration;

/// <summary>
/// Token payment settings bound from the "Payments" configuration section
/// (see appsettings.{Environment}.json).
/// </summary>
public sealed class PaymentsOptions
{
    public const string SectionName = "Payments";

    /// <summary>
    /// Token amount in major currency units charged per proposal. This is a
    /// development/test default only — not an official company business
    /// rule. The backend is the sole authority for the amount: clients can
    /// neither choose nor override it. Must be greater than zero; startup
    /// fails explicitly otherwise (see Program.cs).
    /// </summary>
    public decimal TokenAmount { get; set; }

    /// <summary>
    /// ISO currency code for token payments. Defaults to "INR" when unset;
    /// startup fails explicitly when set to an empty value (see Program.cs).
    /// </summary>
    public string Currency { get; set; } = "INR";

    /// <summary>Real gateway mode: Razorpay test/live orders and signature verification.</summary>
    public const string RazorpayMode = "Razorpay";

    /// <summary>
    /// Demo mode: no external gateway. The server creates a labelled demo
    /// order and a separate confirm endpoint marks it verified. For
    /// internship/demo deployments only: any signed-in customer can unlock
    /// their own proposal PDF without paying.
    /// </summary>
    public const string DemoMode = "Demo";

    /// <summary>
    /// "Razorpay" (default) or "Demo". Set <c>Payments__Mode=Demo</c> to
    /// enable demo payments deliberately; startup fails for any other value.
    /// </summary>
    public string Mode { get; set; } = RazorpayMode;

    /// <summary>True when demo payments are enabled (case-insensitive).</summary>
    public bool IsDemo => string.Equals(Mode, DemoMode, StringComparison.OrdinalIgnoreCase);

    /// <summary>True for a recognised mode value (case-insensitive).</summary>
    public static bool IsValidMode(string? mode) =>
        string.Equals(mode, RazorpayMode, StringComparison.OrdinalIgnoreCase)
        || string.Equals(mode, DemoMode, StringComparison.OrdinalIgnoreCase);
}
