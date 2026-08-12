"""
submit_indexnow.py

Pushes public page URLs to Bing (and any other IndexNow-participating search
engine) via the IndexNow protocol, so pages get picked up faster than waiting
on the normal sitemap crawl cycle.

Ownership is proved by INDEXNOW_KEY_LOCATION - a <key>.txt file at the Music
repo root containing exactly INDEXNOW_KEY - which IndexNow fetches and
compares against the key in each submission.

Two modes:
  - Incremental (default): only compositions/people whose
    public_content_updated_at is within the last LOOKBACK_DAYS days -
    meant to run routinely (e.g. after a batch of editor.js edits),
    resubmitting only what actually changed. No static pages.
  - --full: every composition/person/static URL, no date filter - for the
    initial submission or a full resync.

    pip install requests
    python submit_indexnow.py            # incremental (default)
    python submit_indexnow.py --full     # full resync
"""

import sys
import argparse
from datetime import datetime, timedelta, timezone
import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = "https://tfqnzszyjsdgdeksizel.supabase.co"
API_KEY = "sb_publishable_TxNG1PKrOD3NuBwCKzEfMA_b3-21kij"
HEADERS = {"apikey": API_KEY, "Authorization": f"Bearer {API_KEY}"}

SITE_URL = "https://erlingiv.github.io/Music"
PAGE_SIZE = 1000

INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
INDEXNOW_KEY = "ae6baf5df95338b84b437f69f53cc64a"
INDEXNOW_KEY_LOCATION = f"{SITE_URL}/{INDEXNOW_KEY}.txt"
INDEXNOW_HOST = "erlingiv.github.io"

BATCH_SIZE = 1000
LOOKBACK_DAYS = 2

STATIC_PAGES = [
    f"{SITE_URL}/",
    f"{SITE_URL}/tags.html",
    f"{SITE_URL}/lyricists.html",
    f"{SITE_URL}/musikk-grid.html",
    f"{SITE_URL}/about.html",
]


def get_all(path, select, extra_params=None):
    rows, offset = [], 0
    params_base = {"select": select}
    if extra_params:
        params_base.update(extra_params)
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{path}",
            headers=HEADERS,
            params={**params_base, "limit": PAGE_SIZE, "offset": offset},
            timeout=30,
        )
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def build_full_url_list():
    urls = list(STATIC_PAGES)

    comps = get_all("composition", "composition_id")
    for c in comps:
        cid = c.get("composition_id")
        if cid is None:
            continue
        urls.append(f"{SITE_URL}/score.html?id={cid}")

    persons = get_all("person", "person_id")
    for p in persons:
        pid = p.get("person_id")
        if pid is None:
            continue
        urls.append(f"{SITE_URL}/composer.html?id={pid}")

    return urls


def build_incremental_url_list():
    cutoff = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    filt = {"public_content_updated_at": f"gte.{cutoff}"}
    urls = []

    comps = get_all("composition", "composition_id", extra_params=filt)
    for c in comps:
        cid = c.get("composition_id")
        if cid is None:
            continue
        urls.append(f"{SITE_URL}/score.html?id={cid}")

    persons = get_all("person", "person_id", extra_params=filt)
    for p in persons:
        pid = p.get("person_id")
        if pid is None:
            continue
        urls.append(f"{SITE_URL}/composer.html?id={pid}")

    return urls, cutoff


def submit_batch(urls, batch_num, total_batches):
    print(f"Submitting batch {batch_num}/{total_batches} ({len(urls)} URLs)...")
    body = {
        "host": INDEXNOW_HOST,
        "key": INDEXNOW_KEY,
        "keyLocation": INDEXNOW_KEY_LOCATION,
        "urlList": urls,
    }
    try:
        r = requests.post(INDEXNOW_ENDPOINT, json=body, timeout=30)
    except requests.RequestException as e:
        print(f"  ERROR: request failed: {e}")
        return False
    print(f"  Status: {r.status_code}")
    if r.status_code in (200, 202):
        print(f"  OK: batch {batch_num} accepted.")
        return True
    print(f"  ERROR: unexpected status {r.status_code}. Response body: {r.text[:500]}")
    return False


def submit_all(urls):
    if not urls:
        print("No URLs to submit — skipping IndexNow submission.")
        sys.exit(0)

    batches = [urls[i:i + BATCH_SIZE] for i in range(0, len(urls), BATCH_SIZE)]
    total_batches = len(batches)
    # Every batch still gets attempted even if an earlier one fails (a bad
    # batch shouldn't block the rest from submitting) - but the run as a
    # whole must exit non-zero if any batch failed, so a scheduled CI run
    # actually shows red instead of silently swallowing a real API failure.
    all_ok = True
    for i, batch in enumerate(batches, start=1):
        if not submit_batch(batch, i, total_batches):
            all_ok = False

    print(f"Done. {len(urls)} URL(s) submitted in {total_batches} batch(es).")
    if not all_ok:
        print("One or more batches failed - see ERROR lines above.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Submit URLs to IndexNow.")
    parser.add_argument("--full", action="store_true",
                         help="Submit every composition/person/static URL, no date filter. "
                              "Default (no flag) is incremental: only records changed in the last "
                              f"{LOOKBACK_DAYS} days.")
    args = parser.parse_args()

    if args.full:
        urls = build_full_url_list()
        submit_all(urls)
    else:
        urls, cutoff = build_incremental_url_list()
        print(f"Incremental mode: public_content_updated_at >= {cutoff} ({LOOKBACK_DAYS}-day lookback).")
        if not urls:
            print("No new or updated records since last run — skipping IndexNow submission.")
            sys.exit(0)
        submit_all(urls)


if __name__ == "__main__":
    main()
