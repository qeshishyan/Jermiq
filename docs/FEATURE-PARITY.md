# Սկզբնական կայքի գործառույթների տեղափոխման քարտեզ

Աղբյուրը՝ «Ջերմիք — ջրատաքացուցիչներ և սպասարկում», ընթացիկ հրապարակված կոդի commit՝ `01307e8fc0d5ad0a2b4d19d385e1e1a5175f6413`։ Կատալոգի տվյալները ստուգվել են 2026-10-09-ին։ Փաթեթում ներառված են `electric-30`, `electric-50` և `magnesium-anode` ապրանքների տվյալների ընթացիկ փոփոխությունները։

| Սկզբնական գործառույթ | .NET իրականացում |
|---|---|
| `SiteShell`, header/footer/mobile menu | `Pages/Shared/_Layout.cshtml`, `wwwroot/js/site.js` |
| Գլխավոր էջ, CTA-ներ | `Pages/Shared/_Home.cshtml` |
| Կատալոգ, q որոնում, բոլոր ֆիլտրերը և դասավորումը | `_Catalog.cshtml`, `site.js` |
| Առանձին ապրանք, տեխնիկական տվյալներ, հարակից ապրանքներ | `Pages/Products/Detail.*` |
| Պատվերի ցանկ, քանակ, գումար, ցանկով հայտ | `site.js` cart գործողություններ |
| Մինչև 3 ապրանքի համեմատություն և խորհրդատվություն | `site.js` compare գործողություններ |
| Ընտանիք / տեղադրում / օգտագործում ընտրության օգնական | `site.js` chooser գործողություններ |
| Հինգ տեսակի հայտ, դաշտեր, համաձայնություն, լուսանկար | `_RequestForm.cshtml`, `POST /api/leads` |
| Հայտի համար, կրկնափորձ առանց կրկնակի գրանցման | `Lead.PayloadHash`, GUID primary key |
| Սպասարկում, գնային նկարագրություններ | `_Services.cshtml`, settings |
| Երաշխիք, փաստաթուղթ և սարքի կնիքի բացատրություն | `_Warranty.cshtml` |
| Կապ և տեղադրված հարցի ձև | `_Contact.cshtml` |
| Գաղտնիություն | `_Privacy.cshtml` |
| Երեք օգտակար նյութ, հոդվածների էջեր | `SeedData/articles.json`, `Pages/Guide/Article.*` |
| Կառավարման երեք բաժին | `Pages/Admin/Index.*`, `admin.js` |
| Վերջին 100 հայտ, կարգավիճակներ, մասնավոր ֆայլ, հաստատումով հեռացում | `/api/admin`, `/api/attachments` |
| Ապրանքի ավելացում/փոփոխություն, specs, demo, նկար | `/api/admin`, `/api/product-image` |
| Կոնտակտներ, ժամեր, երաշխիք, առաքում, ծառայությունների գին | `SiteSettings`, `admin.js` |
| WebMCP `start_service_request` | `site.js`, կամընտիր աջակցություն |
| Լոգո, գույներ, responsive դիզայն և երկու նկար | Սկզբնական `site.css`, `logo.svg`, `favicon.svg`, `images/*.webp` |
| Canonical, Article և Product structured data | `SeoService`, Razor layout և էջեր |
| robots/sitemap, demo էջերի noindex | `SeoEndpoints`, `SeoService` |

## Ինքնուրույն հոսթինգի համար փոխված տեխնիկական մասերը

| Նախկին միջավայր | Նոր միջավայր |
|---|---|
| React/Vinext server/frontend | ASP.NET Core Razor Pages + անկախ JavaScript |
| Cloudflare D1 | EF Core + SQLite, migrations |
| Cloudflare R2 | Սերվերի տվյալների առանձին ֆայլային պանակ |
| ChatGPT հաշվի owner claim | Տեղական ASP.NET Core Identity Admin հաշիվ |
| Գլոբալ noindex / ամբողջությամբ փակ robots | Կառավարվող ինդեքսավորում իրական դոմեյնի համար |

Իրական դոմեյնի համար ավելացված են Open Graph/Twitter Cards, ամբողջական Product sitemap, BreadcrumbList և Organization տվյալներ։ Հայտի բոլոր API սխալները վերադարձվում են JSON, իսկ հաճախորդը ստուգում է content-type-ը։ Հին հաճախորդների անձնական տվյալների բազան և մուտքի տվյալները չեն արտահանվել։
