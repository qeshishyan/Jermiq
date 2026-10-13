# Uploaded spare-parts catalog

Imported from the user-supplied spreadsheet and illustration archive on 2026-10-14 (Asia/Yerevan). This is a preliminary catalog, not a verified OEM inventory.

| Brand | Entries |
| --- | ---: |
| Thermex | 11 |
| Ariston | 6 |
| Electrolux | 6 |
| Shivaki | 6 |
| Ballu | 6 |
| Total | 35 |

All 35 entries are `part` products with `demo: true`, no price, and explicitly unconfirmed availability. The five Thermex anode codes (`900 017`, `900 019`, `900 020`, `900 022`, `900 138`) and the `HIT (pro)` compatibility claim are preliminary spreadsheet values. Source status and specifications are retained. The remaining 30 entries have no confirmed SKU or model. No compatibility, price or inventory status was inferred.

The archive contains stylized illustrations, not authentic product photographs. Its `image_mapping.csv` matched all 35 images to spreadsheet row numbers, brand, name and SKU. Images are served locally through `/api/product-image`. Armenian, English and Russian titles, descriptions and availability text are included; codes and source technical specifications are preserved verbatim. Each description explicitly identifies the preliminary data and illustration.

## Administration

Open `/admin?section=products` and filter for parts or demonstration examples. Search by brand, name or code. The standard product editor controls the image, description, brand, model, price, availability and specifications. Use **Languages and site copy** to edit translated titles/descriptions. Unverified entries are excluded from the sitemap and their product pages use `noindex, nofollow`, as with other demonstration products. All five brands are available in the public parts filter.

Before making an entry a real product, confirm its code/specifications/compatibility, replace the illustration with the correct photograph, edit the preliminary description and status, and enter your own price and availability. Clearing the demonstration flag alone does not verify those fields.

## Existing databases and deployment

The versioned bundle lives at `src/Jermiq.Web/SeedData/Imports/uploaded-spare-parts-35`. `UploadedCatalogImport` runs after normal initialization on application startup, on both new and existing databases. It inserts missing entries and skips existing slugs or matching brand/source-code pairs. It never updates existing products. A new database contains 45 products: the original 10 plus these 35.

The Settings marker `catalog-import:uploaded-spare-parts-35:v1` records imported/skipped counts and completion time in the same transaction as the inserts. Subsequent startups preserve administrator edits and deletions. Do not remove this marker merely to restart the application: that would repeat the import. Bundled images missing after a server migration are restored; existing image files are preserved.

The bundle and images are included in `dotnet publish`; updating the deployed application and restarting it applies the import to that server's configured database. Take a database backup before deployment. A Git push does not update a deployed database by itself.

## Source fingerprints

- `JERMIQ_water_heater_spare_parts_catalog.xlsx`: SHA-256 `83475cd24b19a920d906fea9cff3d28f7d6a464eb4af06015a821feb915fc235`
- `JERMIQ_spare_parts_illustrations_35 (1).zip`: SHA-256 `6ca0cc7ba692ed5092e859df1b7ae35e2baf0e6ced5c77cefc1825424aa972f6`

The spreadsheet's notes and archive README describe the records as unverified and the pictures as illustrations. These are source-data qualifications, not additional instructions to the application.

## Validation

`python3 tests/catalog_import_test.py` checks all 35 local illustrations, five brands, translations, preserved codes, additive import into an existing database, SKU deduplication, retained product/settings edits, retained deletion after restart and image restoration. It uses disposable SQLite data only. The ordinary smoke and back-office suites cover rendering, authorization and editing imported products.
