#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
read -r -p 'Administrator email: ' JERMIQ_ADMIN_EMAIL
read -r -s -p 'Password (12+ characters, upper/lowercase, digit and symbol): ' JERMIQ_ADMIN_PASSWORD
printf '\n'
export JERMIQ_ADMIN_EMAIL JERMIQ_ADMIN_PASSWORD
trap 'unset JERMIQ_ADMIN_EMAIL JERMIQ_ADMIN_PASSWORD' EXIT
dotnet run --project "$script_dir/../src/Jermiq.Web/Jermiq.Web.csproj" --no-launch-profile -- --create-admin
