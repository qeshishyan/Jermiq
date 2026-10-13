using Jermiq.Web.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Jermiq.Web.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : IdentityDbContext<IdentityUser>(options)
{
    public DbSet<ProductRecord> Products => Set<ProductRecord>();
    public DbSet<SettingRecord> Settings => Set<SettingRecord>();
    public DbSet<LeadArrival> LeadArrivals => Set<LeadArrival>();
    public DbSet<Lead> Leads => Set<Lead>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<Lead>().HasIndex(x => new { x.Status, x.CreatedAt });
        builder.Entity<Lead>().HasIndex(x => x.CreatedAt);
    }
}
