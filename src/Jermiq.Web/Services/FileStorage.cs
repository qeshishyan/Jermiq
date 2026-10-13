using System.Security.Cryptography;

namespace Jermiq.Web.Services;

public sealed class DataPaths
{
    public string Root { get; }
    public string Files => Path.Combine(Root, "files");
    public string Keys => Path.Combine(Root, "keys");
    public string Database => Path.Combine(Root, "jermiq.db");
    public DataPaths(IConfiguration config, IWebHostEnvironment environment)
    {
        Root = Path.GetFullPath(config["Persistence:DataDirectory"] ?? "App_Data", environment.ContentRootPath);
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(Files);
        Directory.CreateDirectory(Keys);
    }
}

public sealed record CheckedImage(byte[] Bytes, string Extension, string ContentType, string Hash);

public sealed class FileStorage(DataPaths paths)
{
    public const long MaxImageSize = 5 * 1024 * 1024;
    public static async Task<CheckedImage> ValidateImageAsync(IFormFile file, CancellationToken ct)
    {
        if (file.Length is <= 0 or > MaxImageSize)
            throw new ArgumentException("Կցեք JPEG, PNG կամ WebP լուսանկար՝ մինչև 5 ՄԲ։");
        await using var stream = file.OpenReadStream();
        using var memory = new MemoryStream();
        await stream.CopyToAsync(memory, ct);
        var bytes = memory.ToArray();
        var format = file.ContentType switch
        {
            "image/jpeg" when bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255 => ("jpg", "image/jpeg"),
            "image/png" when bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) => ("png", "image/png"),
            "image/webp" when bytes.Length >= 12 && bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8) => ("webp", "image/webp"),
            _ => throw new ArgumentException("Ֆայլի ձևաչափը չի հաստատվել։ Կցեք JPEG, PNG կամ WebP։")
        };
        return new(bytes, format.Item1, format.Item2, Convert.ToHexString(SHA256.HashData(bytes)));
    }

    public async Task<string> SaveAsync(string area, string id, CheckedImage image, CancellationToken ct)
    {
        var key = $"{area}/{id}.{image.Extension}";
        var path = Resolve(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, image.Bytes, ct);
        return key;
    }

    public string Resolve(string key)
    {
        var path = Path.GetFullPath(Path.Combine(paths.Files, key));
        if (!path.StartsWith(paths.Files + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            throw new InvalidDataException("Invalid storage path.");
        return path;
    }
    public string? FindProductImage(string id) => new[] { "jpg", "png", "webp" }
        .Select(ext => Resolve($"products/{id}.{ext}")).FirstOrDefault(File.Exists);
    public static string ContentType(string path) => Path.GetExtension(path) switch
        { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
    public void Delete(string? key) { if (key is not null) File.Delete(Resolve(key)); }
}
