# API պայմանագիր

Հասցեները նույն origin-ի վրա են, ինչ էջերը։ Պատասխանները JSON են՝ նաև API-ի վավերացման, մուտքի և անհայտ հասցեի սխալների դեպքում։ Սխալի մարմինն ունի `{"error":"Հայերեն հաղորդագրություն"}` տեսքը։

Յուրաքանչյուր փոփոխող API հարցում պահանջում է `X-CSRF-TOKEN` header-ը և նույն բրաուզերային session-ի cookie-ն։ Token-ը էջի `<meta name="csrf-token">`-ից է։ Կառավարչի մուտքից հետո բացեք `/admin`-ը՝ նոր token-ը ստանալու համար։ `wwwroot/js/site.js`-ի `api()` օգնականն այս ամենը կատարում է ավտոմատ և չի փորձում HTML-ը JSON վերծանել։

| Մեթոդ և հասցե | Մուտք | Նպատակ |
|---|---|---|
| `GET /api/catalog` | Հանրային | `{products:[...]}` |
| `POST /api/leads` | Հանրային + CSRF | Հայտի գրանցում, multipart/form-data |
| `GET /api/admin` | Admin | `{leads,products,settings}` |
| `POST /api/admin` | Admin + CSRF | Ապրանք/պայմաններ/հայտերի փոփոխություն |
| `POST /api/product-image` | Admin + CSRF | Multipart `image` վերբեռնում |
| `GET /api/product-image?id=GUID` | Հանրային | Ապրանքի նկարը |
| `GET /api/attachments?id=GUID` | Admin | Հայտի մասնավոր նկարը |
| `GET /health` | Հանրային | `{status:"ok"}` |

## Հայտի գրանցում

`POST /api/leads` դաշտեր՝

| Դաշտ | Պայման |
|---|---|
| `requestId` | GUID։ Պահեք նույն համարը ցանցային կրկնափորձի համար։ |
| `kind` | `service`, `question`, `part`, `order`, `callback` |
| `name` | Պարտադիր, 2–100 նիշ |
| `phone` | Պարտադիր, 7–30 նիշ, առնվազն 7 թիվ |
| `email` | Ըստ ցանկության, վավեր էլ․ փոստ, մինչև 200 նիշ |
| `message` | Մինչև 3000 նիշ |
| `subject` | Մինչև 200 նիշ |
| `brand`, `model` | Յուրաքանչյուրը՝ մինչև 100 նիշ |
| `details` | Ընտրության օգնական/համեմատություն/պատվերի ցանկ, մինչև 6000 նիշ |
| `consent` | Պարտադիր `true` |
| `website` | Դատարկ honeypot դաշտ |
| `attachment` | Ըստ ցանկության JPEG/PNG/WebP՝ մինչև 5 ՄԲ |

Նոր հայտ՝ HTTP `201 {"id":"GUID"}`։ Նույն համարով և նույն բովանդակությամբ կրկնափորձ՝ `200`, մեկ գրանցում։ Նույն համարով այլ բովանդակություն՝ `409`։ Ստուգվում է նաև կցված նկարի hash-ը։ Սահմանը՝ 30 POST հարցում / 15 րոպե / IP, խախտման դեպքում՝ `429`։

## Կառավարման գործողություններ

`POST /api/admin`-ը JSON մարմին ունի։

```json
{"action":"status","id":"LEAD_GUID","status":"contacted"}
```

Կարգավիճակներ՝ `new`, `contacted`, `completed`։ Հեռացում՝

```json
{"action":"delete","id":"LEAD_GUID"}
```

Այլ մարմիններ՝ `{"action":"product","product":{...}}` և `{"action":"settings","settings":{...}}`։ Ապրանքի ու պայմանների ամբողջ դաշտերը նկարագրված են `Models/Content.cs`-ում։ Ապրանքի `slug`-ը էջի կայուն հասցեն է․ այն փոխելու դեպքում կստեղծվի նոր հասցեով առանձին ապրանք։ Հրապարակված ապրանքի slug-ը պահեք անփոփոխ։

Նկարի վերբեռնումը վերադարձնում է `{"image":"/api/product-image?id=GUID"}`։ Այդ արժեքը նշանակեք ապրանքին և պահպանեք ապրանքը։ Հայտի նկարները հասանելի են միայն կառավարչին։ Ֆայլերի անունները ձևավորվում են սերվերում, իսկ JPEG/PNG/WebP MIME-ն ստուգվում է նաև իրական ֆայլի սկզբնական bytes-ով։

Կառավարման մուտքը սովորական Razor form է `/admin/login`-ում՝ Identity-ի պաշտպանված session cookie-ով։ `POST /admin/logout`-ը պահանջում է Razor antiforgery token։
