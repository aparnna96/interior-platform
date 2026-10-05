using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace InteriorPlatform.Api.Configuration;

/// <summary>
/// Validated JWT configuration shared by token creation (login) and token
/// validation (JwtBearer), so both always agree on signing key, issuer and
/// audience. Secret, issuer and audience are all required: a missing value
/// fails startup instead of silently weakening validation. The signing key
/// is never exposed (no getter) and never appears in error messages.
/// </summary>
public sealed class JwtSettings
{
    /// <summary>Marks values that a deployment must replace deliberately.</summary>
    public const string PlaceholderPrefix = "REPLACE_WITH_";

    /// <summary>Access-token lifetime (unchanged from the previous behaviour).</summary>
    public static readonly TimeSpan TokenLifetime = TimeSpan.FromMinutes(60);

    /// <summary>
    /// Tolerated clock drift when validating expiry. Explicit and small; the
    /// framework default of 5 minutes is deliberately not used.
    /// </summary>
    public static readonly TimeSpan ClockSkew = TimeSpan.FromMinutes(1);

    private readonly SymmetricSecurityKey _key;

    public JwtSettings(string secret, string issuer, string audience)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(secret);
        ArgumentException.ThrowIfNullOrWhiteSpace(issuer);
        ArgumentException.ThrowIfNullOrWhiteSpace(audience);

        _key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        Issuer = issuer;
        Audience = audience;
    }

    public string Issuer { get; }

    public string Audience { get; }

    /// <summary>
    /// Reads Jwt:Secret, Jwt:Issuer and Jwt:Audience. Throws
    /// <see cref="InvalidOperationException"/> naming the offending key (never
    /// its value) when one is missing, blank, or still a placeholder.
    /// </summary>
    public static JwtSettings Load(IConfiguration configuration)
    {
        var secret = Read(configuration, "Jwt:Secret", "User Secrets or the Jwt__Secret environment variable", allowPlaceholder: true);
        var issuer = Read(configuration, "Jwt:Issuer", "the Jwt__Issuer environment variable", allowPlaceholder: false);
        var audience = Read(configuration, "Jwt:Audience", "the Jwt__Audience environment variable", allowPlaceholder: false);
        return new JwtSettings(secret, issuer, audience);
    }

    /// <summary>
    /// Signature, issuer, audience and lifetime are all validated.
    /// </summary>
    public TokenValidationParameters CreateValidationParameters() => new()
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = _key,
        ValidateIssuer = true,
        ValidIssuer = Issuer,
        ValidateAudience = true,
        ValidAudience = Audience,
        ValidateLifetime = true,
        ClockSkew = ClockSkew,
    };

    /// <summary>
    /// Signs a token carrying the configured issuer and audience.
    /// </summary>
    public string WriteToken(IEnumerable<Claim> claims, DateTime expiresUtc)
    {
        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Audience,
            claims: claims,
            expires: expiresUtc,
            signingCredentials: new SigningCredentials(_key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string Read(IConfiguration configuration, string key, string hint, bool allowPlaceholder)
    {
        var value = configuration[key];
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"{key} is not configured. Set it via {hint}.");
        }

        if (!allowPlaceholder && value.StartsWith(PlaceholderPrefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"{key} still has its placeholder value. Set a deliberate value via {hint}.");
        }

        return value;
    }
}
