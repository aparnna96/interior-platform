using InteriorPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InteriorPlatform.Api.Data.Configurations;

/// <summary>
/// EF Core configuration for <see cref="Payment"/>.
/// </summary>
public class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.HasKey(p => p.Id);

        // Matches AspNetUsers.Id (nvarchar(450)).
        builder.Property(p => p.UserId).IsRequired().HasMaxLength(450);
        builder.Property(p => p.ProposalId).IsRequired();
        builder.Property(p => p.CreatedAt).IsRequired();

        // Enum stored as int in SQL Server (EF Core default for enums).
        builder.Property(p => p.Status).IsRequired();

        // Money precision, matching the estimate/order/proposal tables.
        builder.Property(p => p.Amount).HasColumnType("decimal(18,2)").IsRequired();
        builder.Property(p => p.Currency).IsRequired().HasMaxLength(10);
        builder.Property(p => p.Provider).IsRequired().HasMaxLength(50);

        // Provider references. Razorpay order/payment ids are short ASCII
        // tokens; the signature is a 64-char hex digest (room to spare).
        builder.Property(p => p.ProviderOrderId).HasMaxLength(100);
        builder.Property(p => p.ProviderPaymentId).HasMaxLength(100);
        builder.Property(p => p.ProviderSignature).HasMaxLength(512);

        // Payments are financial history: deleting a user must never
        // silently delete their payment attempts, so block the delete
        // instead. (Same choice as Estimate/Order/Proposal.)
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Payment attempts belong to their proposal's history: deleting a
        // proposal that has payment attempts is blocked so the money trail
        // stays intact.
        builder.HasOne(p => p.Proposal)
            .WithMany()
            .HasForeignKey(p => p.ProposalId)
            .OnDelete(DeleteBehavior.Restrict);

        // Owner/proposal lookups and the verified-payment check.
        builder.HasIndex(p => p.ProposalId);
        builder.HasIndex(p => p.UserId);

        // Provider ids are globally unique per attempt. Both columns stay
        // nullable (set at different lifecycle stages); SQL Server and
        // SQLite unique indexes both permit multiple NULLs.
        builder.HasIndex(p => p.ProviderOrderId).IsUnique();
        builder.HasIndex(p => p.ProviderPaymentId).IsUnique();

        // At most one Verified token payment per proposal. The backend also
        // enforces this in application code (the final authority); this
        // filtered index is a database-level backstop.
        builder.HasIndex(p => p.ProposalId).IsUnique().HasFilter("[Status] = 1");
    }
}
