using InteriorPlatform.Api.Configuration;
using InteriorPlatform.Api.DTOs;
using InteriorPlatform.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace InteriorPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly JwtSettings _jwt;

    public AuthController(UserManager<ApplicationUser> userManager, JwtSettings jwt)
    {
        _userManager = userManager;
        _jwt = jwt;
    }

    // POST /api/auth/register
    [HttpPost("register")]
    [EnableRateLimiting(RateLimitPolicies.AuthRegister)]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email
        };

        // Identity hashes the password and applies password validation.
        var result = await _userManager.CreateAsync(user, request.Password);

        if (!result.Succeeded)
        {
            var errors = result.Errors.Select(e => e.Description).ToArray();
            return BadRequest(new { Errors = errors });
        }

        // Every public registration receives the Customer role. No public
        // endpoint accepts a role choice, so users cannot self-assign.
        var roleResult = await _userManager.AddToRoleAsync(user, "Customer");
        if (!roleResult.Succeeded)
        {
            // Avoid leaving a partially configured account behind.
            await _userManager.DeleteAsync(user);
            var errors = roleResult.Errors.Select(e => e.Description).ToArray();
            return BadRequest(new { Errors = errors });
        }

        // Never return password or password hash.
        return Ok(new { user.Id, user.Email });
    }

    // POST /api/auth/login
    [HttpPost("login")]
    [EnableRateLimiting(RateLimitPolicies.AuthLogin)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            return Unauthorized();
        }

        var passwordValid = await _userManager.CheckPasswordAsync(user, request.Password);
        if (!passwordValid)
        {
            return Unauthorized();
        }

        var roles = await _userManager.GetRolesAsync(user);
        var token = GenerateJwtToken(user, roles);

        return Ok(new { Token = token });
    }

    private string GenerateJwtToken(ApplicationUser user, IList<string>? roles = null)
    {
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        // Role claims use ClaimTypes.Role so [Authorize(Roles = "...")] works
        // with the default Identity role claim mapping.
        if (roles is not null)
        {
            foreach (var role in roles)
            {
                claims.Add(new Claim(ClaimTypes.Role, role));
            }
        }

        // Issuer, audience and signing key come from the shared JwtSettings.
        return _jwt.WriteToken(claims, DateTime.UtcNow.Add(JwtSettings.TokenLifetime));
    }
}
