using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InteriorPlatform.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEstimateRates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EstimateRates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RatePerSquareFoot = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedByUserId = table.Column<string>(type: "nvarchar(450)", maxLength: 450, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EstimateRates", x => x.Id);
                    table.CheckConstraint("CK_EstimateRates_Rate_Positive", "[RatePerSquareFoot] > 0");
                    table.ForeignKey(
                        name: "FK_EstimateRates_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EstimateRates_CreatedAt",
                table: "EstimateRates",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_EstimateRates_CreatedByUserId",
                table: "EstimateRates",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EstimateRates_IsActive",
                table: "EstimateRates",
                column: "IsActive",
                unique: true,
                filter: "[IsActive] = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EstimateRates");
        }
    }
}
