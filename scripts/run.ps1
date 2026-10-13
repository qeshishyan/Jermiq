$ErrorActionPreference = 'Stop'
& dotnet run --project (Join-Path $PSScriptRoot '../src/Jermiq.Web/Jermiq.Web.csproj')
exit $LASTEXITCODE
