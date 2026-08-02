# Musikk Database Project - Claude Code Context

## Project Overview

Norwegian music scores database. Historical Norwegian/Nordic compositions (1800s-mid 1900s).
Published on MuseScore by user 26911315 (Erling).
Backend: Supabase. Frontend: GitHub Pages, multiple HTML pages.
Admin tool: `musikk_editor.html` (markup) + `editor.js` (all JS logic) — two-file split.

## File Locations

- Excel source (cleaned): `E:\OneDrive\database\Innholdsfortegnelse_cleaned.xlsx`
- Excel source (original/master): `E:\OneDrive\Noter\Innholdsfortegnelse.xlsm`
- Scripts: `E:\OneDrive\database\`
- **Git repo (cloned locally)**: `E:\OneDrive\database\Music` — clone of `https://github.com/erlingiv/Music`. Run Claude Code from this folder to get direct git access (commit/push) instead of manual GitHub web upload.

## Data Entry Workflow

1. **xlsm** is the primary data entry file — add new records here
1. **cleaned xlsx** is the editorial layer — corrected composer/lyricist names and spellings
1. **Supabase** is the database — synced from the cleaned xlsx

### Reconciliation script:

`reconcile_xlsm.py` — copies corrected names from cleaned xlsx back into xlsm (by composition title match).
Always prefers cleaned xlsx names. Run after editing cleaned xlsx to keep xlsm in sync.
801 corrections applied on first run (2025) — xlsm and cleaned xlsx are now in sync.

### Adding new records:

Use `add_<name>.py` pattern scripts to insert individual records into Supabase.
See `add_olga_meditation.py` as reference example.

## Scripts

|Script                  |Purpose                                      |Run when                  |
|------------------------|---------------------------------------------|--------------------------|
|`reconcile_xlsm.py`     |Sync corrected names from cleaned xlsx → xlsm|After editing cleaned xlsx|
|`add_olga_meditation.py`|Reference: add individual records to Supabase|One-off imports           |

### Frontpage extraction scripts

All live in `E:\OneDrive\database\`, stage extracted images into `E:\OneDrive\database\frontpages_staging\`, and write a semicolon-delimited report CSV that `frontpage_crop_tool.html` (same folder) reads for the manual crop/upload step. All skip OneDrive cloud-only `.mscz` files rather than force-downloading them (see script docstrings for the `FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS` check).

|Script                                         |Scope / target set                                                                             |Scan root                              |
|------------------------------------------------|------------------------------------------------------------------------------------------------|----------------------------------------|
|`frontpage.py`                                   |Composer-name substring filter (e.g. "thommessen"), Excel report                                |`E:\OneDrive\Noter\eldre populærmusikk` |
|`extract_copyright_illustrated_frontpages.py`    |Copyright compositions (`public_domain != 'Yes'`) with an `Illustrator` credited                |`E:\OneDrive\Noter` (whole tree)        |
|`extract_populaermusikk_frontpages.py`           |ALL scores with `score.has_frontpage = true` and a `musescore_link` — no illustrator/PD filter. Flags (doesn't filter on) whether an illustrator is already recorded, via `illustrator_recorded`/`illustrator_names` report columns | `E:\OneDrive\Noter\Eldre populærmusikk` |

`score.has_frontpage` (boolean) marks a score as *expected* to have a frontpage image in the source material — distinct from `score.frontpage_url`, which is set only once an image has actually been extracted/cropped/uploaded. All three scripts default to skipping scores that already have `frontpage_url` set (`SKIP_IF_HAS_FRONTPAGE = True`).

Staged filenames are prefixed with the score_id when it's unambiguously known (`{score_id}_{original filename}`), resolved *before* staging in all three scripts specifically so this prefix exists — the score_id is otherwise the only thing a native file picker (Safari's, with no way to show the report CSV's mapping) can't infer from a staged filename on its own. Pairs with `e_scoreIdLabel`/`e_frontpageScoreIdLabel` and the Rediger search's "Score-ID" mode (see below) for a direct round trip: staged filename → score_id → Rediger, or Rediger → score_id → which staged file to pick.

`frontpage_crop_tool.html` has a header checkbox "Only rows with illustrator recorded" that filters the loaded report down to rows whose `illustrator_names` column is non-empty (persists via `localStorage`); works with any of the three report layouts above, auto-detected from the CSV header row.

`frontpage_crop_tool.html` itself is desktop/Chromium-only (`showDirectoryPicker()` — no Safari support, iOS or macOS, so no folder browsing there at all). For staged images that don't need cropping — the raw extracted picture is already good enough as-is — `musikk_editor.html`'s Rediger tab has a direct upload field for this instead (see below), which works on any browser including iPad Safari, since it's a plain `<input type="file">` with no folder access and no canvas cropping.

## Supabase

- **Project ID**: `tfqnzszyjsdgdeksizel`
- **URL**: `https://tfqnzszyjsdgdeksizel.supabase.co`
- **Publishable key**: `sb_publishable_TxNG1PKrOD3NuBwCKzEfMA_b3-21kij`
- RLS public SELECT policies applied to all tables
- All API calls use `requests` library with apikey + Authorization headers
- **Table names are ALL LOWERCASE** in the REST API — never PascalCase
- `public_domain` is a **text** field storing "Yes" / "No" / "Unknown" (not boolean)
- `year_composed` is a **text** field (word-based uncertainty qualifiers only — see Naming Conventions)
- **Open architecture item (not started):** migrate from service-role key (currently in `localStorage`, bypasses RLS) to Supabase Auth + RLS policies scoped to `auth.uid()` on all editable tables. Publishable key would replace service-role key; Auth sessions persist so no repeated login. Low probability / high impact risk in current state.

### New tables require explicit grants (from May 30, 2026):

```sql
GRANT SELECT ON public.new_table TO anon, authenticated;
```

## Database Schema

### person

- person_id (PK, autoincrement)
- first_name, last_name
- born (text/date-ish), born_uncertain (**boolean**)
- died, died_uncertain (**boolean**)
- gender (text) — "M" / "F"
- nationality (text, ISO code, stored **lowercase**) — many non-Norwegian composers not yet filled in
- birth_country (text)
- birth_country_primary (boolean, DEFAULT false) — supports dual-nationality display
- photo_url (text)
- pseudonym (text, comma-separated)
- bio_url (memo) — Wikipedia, nb.no, nbl.snl.no etc.
- bio_text (memo) — biography text
- bio_source (text) — citation for bio_text (e.g. "Aftenposten, 12. mars 1938" or "Ancestry.com, kirkebok Bergen 1891"). Freeform, optional.

**Naming conventions for unknown/folk persons:**
- Unknown/folk composer: `first_name = 'Trad'`, `last_name = [country]`
- Unknown/various composer or lyricist: `first_name = 'Composer'/'Lyricist'`, `last_name = 'Unknown'/'Various'`
- Unidentified illustrator (known only by initials or an unreadable graphic mark/monogram): `last_name = 'Illustrator'` (deliberately a separate bucket from `'Unknown'`, so composer/lyricist placeholders don't get diluted by what could be dozens of these), `first_name` = the transcribed initials (e.g. `'H.G.'`, trailing `?` if uncertain) or a short description of the mark (e.g. `'Ankermerke'`). `person.photo_url` is used to hold a cropped image of the actual mark, so visually near-identical placeholders can be told apart at a glance rather than by name alone — see `openIllustratorPhotoCropper` in editor.js.

### composition

- composition_id (PK, autoincrement)
- title (text 255)
- musescore_link (memo) — plain URL
- musescore_notes (text) — renders as `innerHTML` on score.html, composer.html, musikk_editor.html (BBCode links converted to `<a>` before saving)
- musescore_uploaded (date), musescore_modified (date)
- year_composed (text 50) — word-based uncertainty only: `ca. YYYY`, `before YYYY`, `after YYYY`, `YYYY–YYYY`, `YYYY?`. **Never** use `<`/`>` symbols (HTML-unsafe, inconsistent with `lifespan()` which uses the word "after")
- opus_number (text) — normalized format: `Opus N no. N` (full word "Opus", lowercase "no.", no trailing periods)
- public_domain (text) — "Yes" / "No" / "Unknown"
- public_domain_notes (memo)
- composition_notes (memo)
- dedication (text)
- display_country (text) — ISO country code, e.g. "NO", "DE". Overrides inferred nationality on frontend. If blank, frontend falls back to inference:
  1. Single composer, known nationality → composer's nationality wins
  1. Multiple composers with mixed nationalities (e.g. real composer + Trad.) → lyricist's nationality decides
  1. Unknown composer → lyricist's nationality decides
  1. No lyricist either → "Unknown"
- under_arbeid (boolean, DEFAULT false) — work-in-progress flag, shown with amber badge + filter in editor
- to_investigate (boolean, DEFAULT false)
- approved (boolean) — protects manually curated records from MuseScore scrape overwrites

### score (physical item / edition)

- score_id (PK, autoincrement)
- composition_id (FK)
- publisher_id (FK → publisher, nullable)
- plate_number (text) — duplicate check is scoped to `publisher_id + plate_number` (different publishers can share plate numbers)
- year_published (text)
- source_id (FK → source, nullable)
- pdf_url (text)
- mp3_url (text)
- has_frontpage (boolean, DEFAULT false)
- ai_frontpage (boolean, DEFAULT false)

⚠️ **No `category` column on `score`** — this was dropped. `public_domain` lives only on `composition`. `editor.js` must never write a `category` field to `score`.

### publisher

- publisher_id (PK), publisher_name, country, active_from, active_to, notes

### source (lookup table)

- source_id (PK, integer — **not autoincrement**, manually assigned). Stopgap: compute `max+1` with retry-on-conflict. Real fix pending: convert to identity/sequence column.
- source_name (text)

Current values:

|source_id|source_name                |
|---------|---------------------------|
|1        |Physical score             |
|2        |Nasjonalbiblioteket        |
|3        |IMSLP                      |
|4        |PDF                        |
|5        |Internet                   |
|6        |Received from person       |
|7        |UIB                        |
|8        |E-bay                      |
|9        |MuseScore transcription    |
|10       |Unknown                    |
|11       |Norges Melodier I          |
|12       |Norges Melodier II         |
|13       |Einar Økland               |
|14       |Tom B. N                   |
|15       |Egne noter + IMSLP         |
|16       |Finn                       |
|17       |Stefan Lindén              |
|18       |Jon Ruud                   |
|19       |Bergen Offentlige Bibliotek|

### composition_person

Replaces the old `composition_composer` / `composition_lyricist` / `composition_illustrator` tables (migration completed May 2026 — old tables dropped). All frontend pages and the admin tool use this unified table.

- id (PK, autoincrement)
- composition_id (FK)
- person_id (FK)
- role (text) — 'Composer' | 'Lyricist' | 'Arranger' | 'Illustrator'
- credited_as (text) — name variant as printed on the score
- translates_person_id (nullable FK → person.person_id) — links a translator credit to the original lyricist/author

**`UNIQUE (composition_id, person_id, role)`** (added August 2026, after "China Town" turned out to credit the same lyricist twice — once plain, once as `credited_as = "S. S. Wilson"`, a documented pseudonym). A person can only be credited once per role per composition; a pseudonym variant goes in `credited_as` on that single row, not a second row. `editor.js`'s `findDuplicateContributorCredit()` checks for this client-side in both "Ny innføring" and "Rediger" before writing, so a violation shows a clear message rather than a raw constraint error — but the constraint is the actual backstop for any other write path (illustrator reassignment, merges, direct SQL, etc.).

### tag / composition_tag

- tag: tag_id (PK), tag_name
- composition_tag: id, composition_id (FK), tag_id (FK)

### translation_corrections

Overrides for the MyMemory API translation used on score.html.

- id (PK)
- wrong (text)
- correct (text) — **column is named `correct`, not `correct_text`**; `right` is a reserved PostgreSQL word

## Python API Pattern

```python
import requests

SUPABASE_URL = "https://tfqnzszyjsdgdeksizel.supabase.co"
API_KEY = "sb_publishable_TxNG1PKrOD3NuBwCKzEfMA_b3-21kij"
HEADERS = {
    "apikey": API_KEY,
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# SELECT
r = requests.get(f"{SUPABASE_URL}/rest/v1/composition?select=*", headers=HEADERS)

# INSERT
r = requests.post(f"{SUPABASE_URL}/rest/v1/composition", headers=HEADERS, json={...})

# UPDATE
r = requests.patch(f"{SUPABASE_URL}/rest/v1/composition?composition_id=eq.123", headers=HEADERS, json={...})
```

**Note:** Supabase REST API reachability from Claude Code sessions is inconsistent across environments — test before assuming either way. In this project's local Windows CLI session, `curl` reaches both the Supabase REST API and musescore.com directly (verified July 2026). Python's `requests` library fails there with `SSL: CERTIFICATE_VERIFY_FAILED` (the sandbox's TLS path isn't trusted by Python's bundled `certifi` CA store, even though Windows' own trust store — used by `curl` via schannel — accepts it); `requests.get(..., verify=False)` works around it but disables cert verification, so prefer `curl` for ad-hoc lookups from within a session. Some other sandboxed Claude environments (e.g. server-side/cloud) may still have no network path to Supabase at all. For real script runs (not ad-hoc queries), still prefer running Python scripts locally and using the Supabase SQL editor for direct SQL.

## Excel Spreadsheet Structure

### Sheets status:

|Sheet                   |Rows|Imported|Public Domain                       |
|------------------------|----|--------|------------------------------------|
|Eldre klassisk          |1263|YES     |Yes (2 exceptions: Heradstveit = No)|
|Eldre populærmusikk     |876 |No      |Mostly No (copyright) — a few genuinely-PD pieces get found and moved to `Eldre klassisk` when spotted|
|Posca                   |21  |No      |Yes                                 |
|Utenlandsk populærmusikk|91  |No      |No                                  |
|Per Lasson              |16  |No      |Yes                                 |
|Hefter/Album            |4   |No      |Mixed                               |
|Allsanger               |78  |No      |No                                  |
|Forskjellig             |68  |No      |Mixed                               |
|Forskjellige noter      |162 |No      |Mixed                               |
|1905-noter              |22  |No      |Yes                                 |
|Notater                 |35  |No      |Biography text → import to bio_text |

### Eldre klassisk column mapping:

A=comment, B=Kvinne(K=NorwFemale), C=MuseScore flag(x/Privat),
D=Title+MuseScoreURL, E=Composer+bioURL, F=Pseudonym, G=Dates,
H=Lyricist+bioURL, I=LyricistDates, J=Year,
K=Comments→composition_notes, M=Diverse→source, N=EgneNoter→source,
O=Publisher, P=PlateNumber

### Eldre populærmusikk column mapping:

B=Title, C=Composer, D=ComposerDates, E=Lyricist, F=LyricistDates,
G=Year, H=Diverse, I=Diverse, J=Dublett, K=Publisher, L=Nr.

### Source mapping (M/N columns):

NB/Nasjonalbiblioteket → source_id=2
IMSLP → source_id=3
PDF → source_id=4
Internet/Fra nettet → source_id=5
Ruud/Einar Økland etc. → source_id=6 (Received from person) or named source if in table
UIB → source_id=7
E-bay(!) → source_id=8
Other free text → append to composition_notes

## MuseScore Score Info Scraping

### Working method:

```python
from curl_cffi import requests
import json, re

resp = requests.get(url, cookies=cookies, impersonate="chrome")
match = re.search(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                  resp.text, re.DOTALL)
data = json.loads(match.group(1))
score_info = data.get('text')
```

### Getting fresh cookies (expire ~24 hours):

1. Go to musescore.com in browser
1. F12 → Console → type: document.cookie → Enter (note: `document.cookie` returns nothing despite being logged in — cookies must be copied from DevTools Network tab instead)
1. Copy result → paste as COOKIE_STRING in script

### Full scrape script should:

1. Read all musescore_link values from Supabase composition table
1. Fetch each URL using curl_cffi with cookies
1. Extract text field from JSON-LD
1. Convert BBCode links to HTML `<a>` tags before saving
1. Update composition_notes in Supabase
1. Pause 2 seconds between requests
1. Log failures to scrape_failures.txt
1. Skip records where composition_notes already has content, and skip records where `approved = true`

## Frontend

- **GitHub repository**: `https://github.com/erlingiv/Music`
- **GitHub Pages URL**: `https://erlingiv.github.io/Music/`
- Uses Supabase JS client from CDN, no build step required
- Fetches all tables on load with pagination (handles 1000+ row limit)

### Active pages

- `index.html` — composer grid, tabbed by nationality (Norwegian/Nordic/Others/Unknown), recently-added strip, "Browse by Tag" link, Illustrators tab. Composer/illustrator cards carry their originating tab via a `&sec=` URL param into `composerHref()`; on load, `?sec=nordic|others|unknown|dedications|illustrators` restores that tab (added so `composer.html`'s back-link doesn't always land back on the default Norwegian tab)
- `composer.html` — composer profile, scores list with opus grouping, photo thumbnail, dual-nationality flag support, pseudonym display, role-switcher (composer/lyricist view). Reads `?sec=` from the URL and forwards it into both the "← Back" link and the role-switcher (`selfHref()`), so returning to `index.html` restores the tab the visitor came from. "Biography" button: links to `bio.html?id=X` if `person.bio_text` is filled in (takes priority — in-base bio wins over external link), otherwise links to `person.bio_url` externally if that's set, otherwise no button shown. Full `bio_text` is no longer dumped inline into the hero card (added June 2026) — it can be a full transcribed newspaper article, so it lives on `bio.html` instead.
- `score.html` — score detail, PDF.js viewer, audio player, MuseScore embed, translation via MyMemory API (`translate.js`), `translation_corrections` table for overrides, BBCode/tag link rendering via `linkify()`
- `tags.html` — tag cloud with hero images, composition lists. Composition rows render as bordered cards (matching composer.html's `.score-row` style, `0.5rem` gap between rows) and show the same discrete "Godkjent" (approved) dot next to the title when `composition.approved` is true
- `lyricists.html` — lyricist cards, nationality tabs, A–Z filter
- `musikk-grid.html` — Excel-style public domain grid (`public_domain = 'Yes'`)
- `musikk-grid-copyright.html` — copyright variant
- `linkfix.html` — admin tool for retroactively labeling bare URLs in `musescore_notes`
- `bio.html` — dedicated in-base biography article page (added June 2026). Takes `?id=<person_id>`, renders `person.bio_text` as a full article with photo/name/dates header, `bio_source` citation shown right under the header (before the article, not at the bottom — so it's visible without scrolling a long piece), and a link back to `composer.html?id=X`. Supports lightweight heading markup within `bio_text`: a paragraph-block (blank line before/after) starting with `# ` renders as an `<h2>` heading, `## ` renders as an `<h3>` subheading (space after the hashes is required). Falls back to an empty-state message + back link if `bio_text` is blank for that person.
- Private copyright pages (not public-facing): `index-copyright.html`, `composer-copyright.html`, `score-copyright.html`

### musikk-grid.html columns

Title (linked to MuseScore URL), Composer ("First Last (born–died)", linked to `bio_url`), Lyricist (same format), Year, Notes.
Sortable columns, search/filter box, alphabetical A–Z tabs by composer last name, nationality tabs (Norwegian/Nordic/International), click row → detail panel.
Data source: `composition_person` table.

### Admin editor (`musikk_editor.html` + `editor.js`)

- Tabs: Ny innføring (new entry), Rediger (edit/search), Siste (last 10 entries), Arbeidsliste (work list), Bio-lenker, Person management
- Login overlay prompts for service-role key, stored in `localStorage`, assigned to `window.__SUPABASE_KEY__`
- Supports: contributors with `credited_as`, `under_arbeid` flag with amber badge/filter, `has_frontpage`/`ai_frontpage` checkboxes, `year_published`, `musescore_uploaded` auto-date checkbox, photo upload, translator support, dedication/illustrator fields
- Person tab: `p_bioText` textarea (min-height 16rem, sized for full transcribed articles, not just short notes) saves to `person.bio_text`; `p_bioSource` text input saves to `person.bio_source` (citation, shown on `bio.html`). "+ Ny person" button (`startNewPerson()`) clears the loaded person panel and hands back a blank "add new person" form, without going via "Avbryt". `deletePerson()` checks `composition_person` for the person first and blocks the delete (before `confirm()` even runs) if any compositions are still attached
- Person tab photo field: "🗑 Fjern bilde" button (`removePersonPhoto()`, only visible when `p_photoUrl` is non-empty) immediately `PATCH`es `person.photo_url = null` and deletes the Storage object (`deletePersonPhotoFromStorage`) — unlike a normal field edit, this doesn't wait for "Lagre endringer". Manually clearing the `p_photoUrl` text field and saving would also technically clear the DB value, but leaves the file orphaned in Storage; this is the button for actually removing a wrongly-attached photo (e.g. from an illustrator-matching mistake).
- Rediger tab → search now has a third mode, "Score-ID" (`setSearchMode('scoreid')`), alongside Komponist/Tittel — looks up `score_id` directly (`/score?score_id=eq.N` → its composition), for jumping straight from a staged frontpage filename (prefixed with score_id) to the score it belongs to. `loadEditForm(compId, preferredScoreId)` takes an optional second arg carried through from this mode's results (`c._preferredScoreId`) — without it, a composition with more than one score row would still load via `pickPrimaryScore`'s "most complete row" heuristic, which isn't necessarily the exact score_id that was searched for, silently showing a different score's `frontpage_url` than the one just looked up.
- Rediger tab → "Noteeksemplar" card: `e_scoreIdLabel` shows the current score_id (`score_id NNNN`) right in the card title. Also duplicated as `e_frontpageScoreIdLabel` in the "Forside" card's own title, since on a long scrolling page the Noteeksemplar card (near the top) is usually already scrolled out of view by the time you reach the frontpage upload field further down — the id needs to be visible right where it's actually used, not just visible somewhere on the page.
- Rediger tab → "Forside" card: a direct frontpage-image upload field (`uploadFrontpageImage`/`removeFrontpageImage`), separate from the `has_frontpage`/`ai_frontpage` checkboxes. Plain `<input type="file">`, so it works on iPad Safari (unlike `frontpage_crop_tool.html`) — for a staged image that's already good enough as-is, no crop needed. Uploads to the `score-frontpages` bucket as `${scoreId}${original extension}` (keeps the source file's own extension — `.jpg` or `.png` — unlike the crop tool, which always re-encodes to `.jpg` via canvas), and both upload and remove `PATCH` `score.frontpage_url`/`has_frontpage` immediately rather than waiting for "Lagre endringer", for the same orphaned-file reason as the person photo remove button. Shares `deleteStorageObject(bucket, path)` / `extractStoragePath(url, bucket)` with the person-photo code (generalized from bucket-specific versions to avoid a third near-duplicate).
- Contributor rows (composer/lyricist/arranger/illustrator/translator, in both "Ny innføring" and "Rediger"): the displayed person name is clickable and jumps straight to that person's record on the Person tab (`switchTab('person'); loadPersonForm(person_id)`)
- Person tab → "Vis komposisjoner" list: rows with `role = Illustrator` and an uploaded `score.frontpage_url` get a 📷 button (`openIllustratorPhotoCropper`) that opens a modal built entirely in JS (same pattern as `openComposerScores`), with three modes toggled by `icpSetMode('use'|'new'|'existing')`. Since `loadPersonCompositions(personId)` only ever lists compositions already credited to the person you're viewing, this row's credit already points at *some* person — the three modes cover the three things that could actually mean. `isPlaceholder` (the button's 4th arg, `true` when the currently-viewed person's own `last_name === "Illustrator"`) hides "Bruk som bilde" and defaults straight to "+ Ny person" instead — that mode never touches `composition_person`, so using it on a shared placeholder's own list looked like a no-op save (the row correctly stayed put, since nothing was reassigned) while actually just polluting the placeholder's own `photo_url` with one arbitrary crop.
  - **"Bruk som bilde"** (default, hidden entirely when `isPlaceholder`): the composition is already correctly credited (e.g. a real, already-identified illustrator) — crop and save just sets that crop as the existing person's `photo_url` (`saveIllustratorPhotoForCreditedPerson`); `composition_person` is untouched. This is the common case when you already know who illustrated a score and just want their photo.
  - **"+ Ny person"**: the credit is currently a placeholder (e.g. "Only Initials") and this mark hasn't been identified before — drag/resize a crop box over the frontpage image, type a name, and save (`saveIllustratorCropPerson`) — creates a new `person` row (naming convention: `last_name = "Illustrator"`, `first_name` = transcribed initials or a short description of the mark), uploads the crop as that person's `photo_url`, and reassigns that one `composition_person` row to the new person.
  - **"Match mot eksisterende"**: the mark has been identified before under a different person record — search-as-you-type over existing persons (`icpWireExistingSearch`), showing each match's `photo_url` thumbnail inline for visual comparison against the image on screen — clicking one just `PATCH`es the `composition_person` row to that person's id (`attachIllustratorToExistingPerson`), no crop/upload needed. This is what lets a second (third, fourth…) sighting of an already-identified mark get attached to the same person instead of creating a duplicate placeholder each time.

  Deliberately URL-based (not local-file-based like `frontpage_crop_tool.html`) so it works on any browser, including iOS Safari, which has no File System Access API. Crop-box dragging/resizing uses **Pointer Events** (not mouse events) with `setPointerCapture`, specifically so it also works with touch input — mouse events never fire on iOS Safari, which silently broke dragging there. The modal itself is near-fullscreen (`96vw`/`96vh`) so there's enough room to place the crop box precisely, especially by finger.
- **Illustratører** tab: the reverse direction of the crop tool's "Match mot eksisterende" mode. Pick an already-identified illustrator from a photo gallery (`loadIllustratorsTab` — every distinct `person_id` credited `role=Illustrator`, excluding the "Only Initials" placeholder itself), which loads every remaining "Only Initials"-credited composition that has an uploaded frontpage image as a candidate grid (`selectIllustratorForMatching`). Clicking a candidate opens a compare modal (`openIllustratorCompareModal`). If the selected illustrator already has a `photo_url`, it's a plain side-by-side compare (their photo vs. the candidate's frontpage image); if they don't, the candidate side becomes an interactive crop box instead of a static image — confirming (`confirmIllustratorMatch`) then both crops+uploads that region as their `photo_url` *and* `PATCH`es the `composition_person` row, so a photo only ever gets captured when one doesn't already exist (a real portrait is never at risk of being overwritten). Either way the candidate list refreshes afterward so the just-attached one drops off. Useful for working through many unknowns against one known illustrator, as opposed to the Person-tab tool's one-unknown-at-a-time direction.
- The crop-box drag/resize UI is shared across both entry points via `buildCropBox(wrapEl, imgEl, getBox, setBox)` — box state lives in the caller so each usage stays independent; it returns `{ el, reset, sync }`, where `sync` re-renders the box's on-screen position/size from whatever the caller's `getBox()` currently returns (used after an external change to the box state, e.g. a zoom step, that didn't go through the box's own drag handlers). `mountCropImage(area, imageUrl)` mounts the image itself, sizing it via a computed "fit" width/height (from `area.getBoundingClientRect()` and the image's natural aspect ratio) rather than CSS percentages — percentage `max-height` only resolves against an ancestor with a *definite* height, and an auto-sized shrink-wrap div never has one, so that silently became `max-height:none` and let the image overflow its `overflow:hidden` container (visible as the image being stuck showing only its top portion, worst on tall portrait scans, e.g. on iOS). It also returns `zoom(factor)`, which resizes the image to `factor × fit size` (clamped 1x–8x) and returns the scale actually applied; `wireZoomControls(area, zoomFn, cropBoxHandle, getBox, setBox, zoomInBtn, zoomOutBtn)` wires +/− buttons and mouse-wheel zoom (`wheel` + `preventDefault`) to that, rescaling the crop box by the same factor via `getBox`/`setBox` and then `cropBoxHandle.sync()` so it stays visually anchored to the same image content as it grows/shrinks. `area.style.overflow` switches to `'auto'` once zoomed (content can exceed the viewport and needs to be pannable), and `area`'s layout switches from flex-centering to `display:block; text-align:center` — a flex container with `align-items/justify-content:center` silently blocks scrolling to the "start" side of an overflowing child in most browsers, which would make zooming in feel broken. Likewise `cropImageToBlob()` and `uploadAndSetPersonPhoto()` are shared for the canvas-crop and Storage-upload steps. No dedicated field exists yet for "illustrator mark" images distinct from a person's real portrait — `photo_url` is deliberately reused for both, since very few illustrators currently have an actual portrait on file; revisit with a separate `illustrator_mark_url` column if that stops being true.

### Key architecture rules (editor.js)

1. **No silent failures.** Every async save/action must produce a visible outcome. Wrap handlers in try/catch; call `scrollIntoView` on message divs.
1. **Validate before writing.** "Ny innføring" flow: validate ALL fields first, then write `composition` → `composition_person` → `score` as three sequential REST calls. Roll back earlier rows if a later insert fails.
1. **Check both save paths.** Any bug fixed in new-entry flow must also be checked in `saveEdit` (edit flow), and vice versa.
1. **Case-insensitive matching.** Source and publisher name lookups use `ilike` or normalized map lookups, not exact match.
1. **Freeze field values before async pauses.** Snapshot form values (including contributor roles) before confirmation dialogs or async operations.

## Known Learnings

- Fields removed from the DB but left in code (e.g. `category` on `score`) cause inserts to fail silently after earlier tables already committed — looks like a display bug, not a save failure. Always verify against the live schema when debugging "data not saving."
- Multi-table saves without real transactions fail partially — validate everything first, write in FK order, roll back on failure.
- Supabase FK join syntax is unreliable on newly created tables — split into two separate API queries instead of embedded selects.
- `not.eq.true` filters exclude NULL in PostgreSQL — use `or=(field.eq.false,field.is.null)` for null-safe false checks.
- Converting `function` declarations to `const` removes hoisting — calls before declaration silently kill all script execution.
- Supabase Storage bucket filenames are case-sensitive; re-uploading creates versioned copies rather than overwriting — manually delete before re-upload of the same filename.
- Local `.mscz` folder placement under `E:\OneDrive\Noter` (e.g. `Eldre klassisk` vs `Eldre populærmusikk`) is meant to track `composition.public_domain`, but isn't authoritative — always confirmed against Supabase (July 2026: 6 compositions found flagged `public_domain=Yes` while still filed under `Eldre populærmusikk`; moved to `Eldre klassisk` once found). Folder-scoped scripts like `extract_populaermusikk_frontpages.py` only see whatever is currently filed in their `SCAN_ROOT` at run time.

## Known Issues / TODO

### Next steps

1. Publisher cleanup for Eldre populærmusikk
1. Add remaining Excel sheets to Supabase import
1. Build sync script: xlsm → Supabase (detect new rows not yet imported)
1. Backfill `nationality` on existing person records (many non-Norwegian still blank)
1. Convert `source.source_id` to a Postgres identity/sequence column
1. Supabase Auth migration (replace service-role key with `auth.uid()`-scoped RLS)
1. True atomic multi-table inserts via Postgres RPC (replace sequential REST calls)
1. API function consolidation, hard-coded row limit review, inline handler refactoring
1. Analytics/visit tracking via `page_view` table (owner-filtering via `localStorage` `is_owner` flag + `?owner=true` param) — deferred
1. Private draft visibility (`musescore_visibility` column or `is_private_draft` boolean) — paused
1. Domain name for the site — `oldmusic.com` taken/expensive; `oldmusic.uk` / `oldemusic.com` considered, not decided

## Python Environment (Windows PC)

- Python 3.12.6 — command is `python` (not `python3`, which is not available on this machine)
- Installed: openpyxl, curl_cffi, selenium, beautifulsoup4, requests, thefuzz
- Node.js v24.14.0

## Preferred Working Method

- Database changes: use Supabase SQL editor directly (not curl/bash)
- File editing: Python string replacement (`encoding='utf-8'`) for files with Norwegian Unicode characters when `str_replace` fails
- Files uploaded directly to GitHub via web UI — no build step
- Both this file and in-session memory must be updated when schema/architecture changes — they can drift independently

## HTML/JS Editing Rules

- After every edit to an HTML file, always run a JS syntax check before delivering:

```bash
python -c "
import re, os, tempfile
with open('file.html', encoding='utf-8') as f: content = f.read()
scripts = re.findall(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
tmp = os.path.join(tempfile.gettempdir(), 'test.js')
open(tmp, 'w', encoding='utf-8').write('\n'.join(scripts))
print(tmp)
"
node --check <path printed above>
```

**Windows note: always use `python`, never `python3` — `python3` is not available on this machine.**

- A JS syntax error silently breaks ALL interactivity (tabs, buttons, everything stops working)
- Never deliver an HTML file without passing this check first
- Always grep score.html for existing variable names before writing any new .js file that shares scope with it (duplicate `const` declarations across script tags/files crash all JS silently)

## Refactoring Rules

- After any refactor converting `function` declarations to `const` assignments,
  verify declaration order: grep for the function name and confirm no calls
  appear above the declaration line.
