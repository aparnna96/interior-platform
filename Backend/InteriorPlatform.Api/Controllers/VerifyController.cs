using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InteriorPlatform.Api.Controllers;

/// <summary>
/// Minimal endpoints for verifying JWT authentication and role-based
/// authorization. No business logic; each action only proves the
/// corresponding [Authorize] policy was satisfied.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class VerifyController : ControllerBase
{
    [HttpGet("any")]
    [Authorize]
    public IActionResult Any() => Ok(new { Ok = true, Policy = "any" });

    [HttpGet("customer")]
    [Authorize(Roles = "Customer")]
    public IActionResult Customer() => Ok(new { Ok = true, Policy = "Customer" });

    [HttpGet("fieldstaff")]
    [Authorize(Roles = "FieldStaff")]
    public IActionResult FieldStaff() => Ok(new { Ok = true, Policy = "FieldStaff" });

    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public IActionResult Admin() => Ok(new { Ok = true, Policy = "Admin" });
}
