namespace InteriorPlatform.Api.DTOs;

/// <summary>
/// Admin product shape: the public <see cref="ProductResponse"/> fields
/// plus <see cref="IsActive"/> so deactivated products stay visible to Admin.
/// </summary>
public class AdminProductResponse : ProductResponse
{
    public bool IsActive { get; set; }
}
