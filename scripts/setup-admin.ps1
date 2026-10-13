param([string]$Email)
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot '../src/Jermiq.Web/Jermiq.Web.csproj'
if (-not $Email) { $Email = Read-Host 'Administrator email' }
$secure = Read-Host 'Password (12+ characters, upper/lowercase, digit and symbol)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:JERMIQ_ADMIN_EMAIL = $Email
    $env:JERMIQ_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    & dotnet run --project $project --no-launch-profile -- --create-admin
    if ($LASTEXITCODE -ne 0) { throw 'Administrator creation failed.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    Remove-Item Env:JERMIQ_ADMIN_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:JERMIQ_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
