# TERMOMASTER

The storefront and office use the supplied TERMOMASTER identity: an orange flame
mark, a navy **TERMO** and orange **MASTER** wordmark, and the Armenian descriptor
«Էլեկտրական ջրատաքացուցիչների կենտրոն». The promise is «Տաք ջուր՝ վստահ ամեն օր».
The descriptor, promise and supporting copy have English and Russian translations.

The shared public and office brand partials are `_Brand.cshtml` and
`_OfficeBrand.cshtml`. Responsive presentation is in `wwwroot/css/brand.css`.
The public header puts search and language selection on a second row on narrower
screens so the complete wordmark stays visible alongside the shopping controls.

Web assets are under `wwwroot/images/brand/`: the transparent mark, full logo,
192px touch icon and 1200×630 social preview. `/logo.svg` and `/favicon.svg` also
contain the current mark; favicon links include a content version for cache
refresh. Product-specific social images continue to use their product photos.

`BrandIdentity` defines the name, descriptive phrases and asset paths. Public
metadata, organization/article structured data, headers, footer, navigation,
loading feedback, administration and the request export filename use the current
brand.

## Existing content

Stored CMS phrases and source keys, store information, homepage settings and
contact/terms text receive the current brand when read. Custom surrounding copy
and revision numbers are retained. If a translation has both an old-name and a
current-name key, the explicit current-name entry wins. The CMS saves normalized
copy through its existing revision-controlled workflow.

No database migration is needed. Database names, authentication cookies, data
protection application identifiers, deployment configuration and browser storage
keys retain their existing identities. Existing carts, favorites, sessions and
customer records therefore keep working. The text normalizer preserves URLs,
email addresses and technical identifiers rather than inventing new domains or
contact details.

The information integration tests cover an old persisted store and customized
old-name CMS translation; both render the new brand while keeping their custom
wording and saved snapshots intact.
