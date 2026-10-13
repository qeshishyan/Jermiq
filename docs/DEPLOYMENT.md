# Տեղադրում սեփական հոսթինգում

Հոսթինգը պետք է գործարկի **ASP.NET Core 10**։ Կայքն ինքնուրույն .NET ծրագիր է։ Ընտրեք Windows/IIS, Linux/Nginx կամ Docker տարբերակը։

## Ընդհանուր կարգավորումներ

Սկզբնական `appsettings.json`-ը նախատեսված է տեղային գործարկման համար։ Սերվերում օգտագործեք environment variables կամ `appsettings.Production.json`։ Գաղտնաբառերը պահեք environment/secret manager-ում։

| Կարգավորում | Օրինակ և նշանակություն |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `Seo__BaseUrl` | `https://YOUR_DOMAIN`՝ առանց path/query-ի |
| `Seo__IndexingEnabled` | `true`՝ հանրային գործարկման ժամանակ |
| `Security__RequireHttps` | `true`՝ HTTPS և secure admin cookie |
| `Security__TrustedProxies__0` | Իրական reverse proxy-ի IP, օրինակ՝ `127.0.0.1` |
| `Persistence__DataDirectory` | Բազայի, ֆայլերի և բանալիների մշտական պանակ |
| `Persistence__ApplyMigrationsOnStartup` | Լռելյայն `true`՝ migrations ավտոմատ կիրառելու համար |
| `AllowedHosts` | Իրական դոմեյնը, օրինակ՝ `YOUR_DOMAIN;www.YOUR_DOMAIN` |

`YOUR_DOMAIN`-ը փոխարինեք ձեր դոմեյնով։ HTTPS-ը ավարտող proxy-ն պետք է փոխանցի `X-Forwarded-Proto`։ Ծրագիրը վստահում է միայն թույլատրված proxy-ներին։ Տեղային HTTP փորձարկման համար `Security__RequireHttps=false`։

## 1. Windows Server / IIS

1. Սերվերի վրա տեղադրեք IIS և **.NET 10 Hosting Bundle**-ը՝ https://dotnet.microsoft.com/download/dotnet/10.0 ։ Տեղադրման ավարտին վերագործարկեք IIS-ը։
2. Ձեր համակարգչում ստեղծեք տեղադրվող ֆայլերը՝

```powershell
dotnet publish src/Jermiq.Web -c Release -o publish
```

3. `publish`-ի պարունակությունը տեղափոխեք, օրինակ՝ `C:\Sites\Jermiq`։ Ստեղծեք IIS կայք և App Pool՝ **No Managed Code** պարամետրով։ .NET publish-ը ստեղծում է անհրաժեշտ `web.config`-ը։
4. Տեղադրեք դոմեյնի SSL certificate-ը և ավելացրեք HTTPS binding։
5. Ստեղծեք տվյալների պանակ՝ `C:\Data\Jermiq`։ App Pool-ի հաշվին տվեք այդ պանակում Read/Write/Modify իրավունք։
6. Տեղադրված ծրագրի կողքին ստեղծեք `appsettings.Production.json`՝

```json
{
  "AllowedHosts": "YOUR_DOMAIN;www.YOUR_DOMAIN",
  "Persistence": { "DataDirectory": "C:\\Data\\Jermiq", "ApplyMigrationsOnStartup": true },
  "Seo": { "BaseUrl": "https://YOUR_DOMAIN", "IndexingEnabled": true },
  "Security": { "RequireHttps": true, "TrustedProxies": ["127.0.0.1"] }
}
```

7. Ստեղծեք կառավարիչ՝ նախապատրաստված ծրագրի պանակում, IIS-ը ժամանակավորապես կանգնեցրած։ Գաղտնաբառը մուտքագրեք թաքցված prompt-ով՝

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Production'
$env:JERMIQ_ADMIN_EMAIL = Read-Host 'Administrator email'
$secure = Read-Host 'Password' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:JERMIQ_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    dotnet .\Jermiq.Web.dll --create-admin
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    Remove-Item Env:JERMIQ_ADMIN_PASSWORD, Env:JERMIQ_ADMIN_EMAIL -ErrorAction SilentlyContinue
}
```

8. Գործարկեք IIS կայքը և բացեք `https://YOUR_DOMAIN/admin/login`։

## 2. Linux / Nginx / systemd

Սերվերի վրա անհրաժեշտ են .NET 10 ASP.NET Core Runtime-ը և Nginx-ը։ Publish արեք ձեր համակարգչում՝

```bash
dotnet publish src/Jermiq.Web -c Release -o publish
```

Ստեղծեք ծրագրի և տվյալների առանձին պանակներ՝

```bash
sudo useradd --system --home /var/www/jermiq --shell /usr/sbin/nologin jermiq
sudo install -d -o jermiq -g jermiq /var/www/jermiq /var/lib/jermiq
```

Տեղափոխեք `publish`-ի պարունակությունը `/var/www/jermiq` և տվեք `jermiq` հաշվին կարդալու իրավունք։ Տվյալների պանակի սեփականատերը պետք է լինի `jermiq`։

`deploy/jermiq.service`-ում լրացրեք դոմեյնը և հաստատեք `dotnet`-ի իրական ուղին։ `deploy/nginx.conf`-ում լրացրեք դոմեյնն ու SSL certificate-ի ուղիները։ Տեղադրեք դրանք systemd-ի և Nginx-ի համապատասխան պանակներում։ Կառավարիչ ստեղծեք նույն տվյալների պանակով՝

```bash
cd /var/www/jermiq
read -r -p 'Administrator email: ' JERMIQ_ADMIN_EMAIL
read -r -s -p 'Password: ' JERMIQ_ADMIN_PASSWORD
printf '\n'
export JERMIQ_ADMIN_EMAIL JERMIQ_ADMIN_PASSWORD
sudo --preserve-env=JERMIQ_ADMIN_EMAIL,JERMIQ_ADMIN_PASSWORD -u jermiq \
  env ASPNETCORE_ENVIRONMENT=Production Persistence__DataDirectory=/var/lib/jermiq \
  dotnet Jermiq.Web.dll --create-admin
unset JERMIQ_ADMIN_EMAIL JERMIQ_ADMIN_PASSWORD
sudo systemctl daemon-reload
sudo systemctl enable --now jermiq
sudo nginx -t
sudo systemctl reload nginx
```

Հասցեն՝ `https://YOUR_DOMAIN`։ Լոգերը՝ `journalctl -u jermiq`։ Սերվերի `127.0.0.1:5080` պորտը թողեք միայն Nginx-ի համար։

## 3. Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Սկզբնական փորձարկման հասցեն՝ `http://localhost:8080`։ Տվյալները պահպանվում են `jermiq-data` volume-ում։ Կառավարիչ ստեղծելու համար գաղտնաբառը փոխանցեք միջավայրով՝ առանց command argument-ի.

```bash
read -r -p 'Administrator email: ' JERMIQ_ADMIN_EMAIL
read -r -s -p 'Password: ' JERMIQ_ADMIN_PASSWORD
printf '\n'
export JERMIQ_ADMIN_EMAIL JERMIQ_ADMIN_PASSWORD
docker compose exec -e JERMIQ_ADMIN_EMAIL -e JERMIQ_ADMIN_PASSWORD \
  jermiq dotnet Jermiq.Web.dll --create-admin
unset JERMIQ_ADMIN_EMAIL JERMIQ_ADMIN_PASSWORD
```

Հանրային տեղադրման համար ավելացրեք HTTPS reverse proxy։ `.env`-ում լրացրեք իրական HTTPS դոմեյնը, միացրեք indexing/HTTPS-ը և նշեք proxy-ի IP-ն՝ ինչպես այն երևում է կոնտեյների ներսից։ Nginx-ի template-ում upstream-ը դարձրեք `http://127.0.0.1:8080`։ `docker compose up -d`-ով կիրառեք փոփոխությունները։

## SEO-ի գործարկում

1. `/admin`-ում լրացրեք իրական ապրանքային տվյալները, գները, նկարները, կոնտակտները և պայմանները։
2. Հաստատված ապրանքների մոտ անջատեք «Ցուցադրական օրինակ»-ը։
3. Լրացրեք `Seo__BaseUrl`-ը և միացրեք `Seo__IndexingEnabled=true`։ Development միջավայրում ինդեքսավորումը միշտ անջատված է։
4. Ստուգեք `/robots.txt`, `/sitemap.xml` և ապրանքի էջի canonical-ը։
5. Դոմեյնը հաստատելուց հետո sitemap-ը կարող եք ներկայացնել Google Search Console-ին։ SEO տեխնիկական կազմը չի նշանակում որոնման դիրքերի երաշխիք։

## Տվյալների պահպանում և նոր տարբերակների տեղադրում

Վերատեղադրեք միայն publish ֆայլերը՝ պահպանելով `Persistence__DataDirectory`-ի պարունակությունը։ Այն ներառում է `jermiq.db`, հնարավոր WAL/SHM ֆայլերը, `files` և `keys` պանակները։ Փոքր կայքի ամբողջական պահուստի համար կանգնեցրեք ծրագիրը և պատճենեք ամբողջ տվյալների պանակը։ Գործող SQLite բազայի միայն հիմնական ֆայլի պատճենումը կարող է բաց թողնել WAL-ում եղած տվյալները։

SQLite տարբերակը նախատեսված է մեկ հավելվածային սերվերի և տեղային սկավառակի համար։ Բազմասերվեր տեղադրում կատարելիս տեղափոխեք DB-ն ընդհանուր SQL Server/PostgreSQL-ի և ֆայլերը ընդհանուր օբյեկտային պահոցի վրա։

Նոր DB փոփոխությունների համար՝

```bash
dotnet tool install --global dotnet-ef --version 10.0.12
dotnet ef migrations add YourChange --project src/Jermiq.Web --output-dir Data/Migrations
```

Նոր migration-ը պահեք source code-ում և կիրառեք տեղադրման ժամանակ։ Docker/IIS/Nginx կոնֆիգուրացիաները ներառված են որպես տեղադրման template-ներ․ այս միջավայրում կատարված ստուգումները .NET build/publish և իրական HTTP ստուգումներն են։
