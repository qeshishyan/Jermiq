namespace Jermiq.Web.Services;
public sealed class LocalizedError(string message, int status = 400) : IResult
{
    public async Task ExecuteAsync(HttpContext context)
    {
        context.Response.StatusCode = status;
        await context.Response.WriteAsJsonAsync(new { error = context.RequestServices.GetRequiredService<ContentLocalizer>()[message] }, context.RequestAborted);
    }
}
