# Customer information and delivery pricing

The storefront has eight customer information pages: `/ordering`, `/delivery`,
`/payment`, `/returns`, `/warranty`, `/terms`, `/privacy`, and `/about`. Each page
supports an introduction, ordered content sections, and frequently asked questions.
Text is rendered as encoded plain text, with blank lines separating paragraphs.

## Editing

Open **Admin → Catalog structure → Information pages** (`/admin/store`). Select a
page, edit its introduction, add or reorder sections and questions, and save the
information form. Changing the selected page retains edits within that form.
The same area manages delivery options, their public visibility, prices,
“starting from” labels, delivery windows, notes, and optional free-delivery
thresholds. An empty price means “by agreement”; zero explicitly means free.

Existing delivery and warranty text remains under **Contacts and terms**. Existing
payment and about summaries remain editable in the information form. These
summaries supplement the detailed pages and are preserved when upgrading an
existing database. The **Languages and site copy** section manages translations.

## Starting terms

The initial content and rates are editable starting terms requested by the owner:

- Yerevan: from 1,500 AMD, normally 1–2 working days after confirmation.
- Regions: from 3,000 AMD, normally 2–5 working days after confirmation.
- Pickup: no delivery charge; collection time and location are agreed first.

The delivery page explains the effect of parcel dimensions, destination, access,
and additional handling. The order's final delivery price and total are agreed
before dispatch. These public rates do not automatically charge the customer or
change the checkout API's existing confirmation process. The optional free-delivery
threshold is informational and should describe the published option's actual
conditions when enabled.

The site does not claim an online card payment integration. Warranty terms refer
to the specific product or work document; return guidance distinguishes a change
of mind from a defective or incorrectly supplied item. Contact details and
collection addresses are shown only when configured.

## Data compatibility

`StoreCatalogConfiguration.Information` is stored in the existing JSON settings
record; no database migration is required. Older snapshots load defaults from
`SeedData/store-information.json` without overwriting other saved content. An older
API client that omits the new property preserves the information already saved.
Updates keep the existing revision conflict protection. Unpublished delivery
options are excluded from public configuration and pages.

Long information introductions, section bodies and answers are translated on the
server and by the public catalog API. They are omitted from the UI translation
dictionary embedded in every page, so adding the detailed information does not
download all eight pages' prose again on each navigation. The full CMS translation
dictionary remains available to its authorized editor.

## Navigation feedback and pagination

The navigation indicator starts after 180 ms for ordinary internal navigation or
a valid GET form. It does not delay navigation, cover the page, or intercept
interaction. It resets on browser history restoration, Escape, and a recovery
timeout, and respects reduced motion. Canceled AJAX actions, dialogs, downloads,
external links, and new-tab actions do not start it.

Catalog and parts pagination mark the current page with `aria-current="page"` and
a persistent visual state. The admin product catalog also has numbered page
controls, retains keyboard focus, and resets to the first page after filtering.
The language link helper decodes Razor-encoded attribute content before parsing
and encoding its final URL. This preserves pagination and filters together;
previously a second query parameter could become an `amp;`-prefixed parameter.
