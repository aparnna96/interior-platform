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
}
