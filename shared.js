// ============================================
// Music Scores — Shared Helpers
// Used by: index.html, score.html, composer.html, tags.html
// Load after config.js, before each page's own inline script.
// ============================================

// score.html determines PD vs copyright itself from the composition's own
// public_domain value, so no mode param is needed here.
function scoreHref(id) {
  return 'score.html?id=' + id;
}

// Creates the <meta name="description"> tag if the page doesn't already have
// one (it should, as a static fallback, but this covers pages that don't),
// then updates its content once real data has loaded. Search engines index
// whatever's in the DOM after JS runs, but the static fallback in <head>
// still matters for the brief window before that / for any crawler that
// doesn't execute JS at all.
function setMetaDescription(text) {
  let tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', 'description');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', text);
}

function lifespan(born, died, diedUncertain) {
  const uncertain = (diedUncertain === 'yes' || diedUncertain === true);
  if (!born && !died) return '';
  if (born && !died) return String(born);
  if (!born && died)  return uncertain ? 'after ' + died : String(died);
  return born + '–' + (uncertain ? 'after ' + died : died);
}

function codeToFlag(code) {
  if (!code || code.length < 2) return '';
  return [...code.toUpperCase().slice(0,2)]
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

function renderFlags(nationality, birthCountry, birthCountryPrimary, nationalityUncertain) {
  const bcp    = (birthCountryPrimary === true);
  const prime  = bcp && birthCountry ? birthCountry : nationality;
  const second = bcp && birthCountry ? nationality  : birthCountry;
  const pFlag  = codeToFlag(prime);
  if (!pFlag) return '';
  let out = pFlag;
  if (second && second !== prime) {
    const sFlag = codeToFlag(second);
    if (sFlag) {
      const title = bcp ? 'Karriereland: ' : 'Born: ';
      out = pFlag + '<span style="font-size:0.65em;vertical-align:super" title="' + title + second + '">' + sFlag + '</span>';
    }
  }
  // nationality_uncertain flags cases where the career-country flag was
  // inferred from the name rather than confirmed — fade the flag itself and
  // add a small "?" badge, both carrying an explanatory tooltip.
  if (nationalityUncertain === true) {
    const tip = 'Nasjonalitet antatt ut fra navn, ikke bekreftet';
    return '<span style="opacity:0.5" title="' + tip + '">' + out + '</span>'
         + '<sup style="font-size:0.6em" title="' + tip + '">?</sup>';
  }
  return out;
}

function wordCount(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function msInfoBadge(notes) {
  const wc = wordCount(notes);
  if (wc === 0)  return '<span class="ms-dot ms-low" style="visibility:hidden"></span>';
  if (wc <= 100) return '<span class="ms-dot ms-low"  title="MuseScore info: ~' + wc + ' words"></span>';
  if (wc <= 300) return '<span class="ms-dot ms-med"  title="MuseScore info: ~' + wc + ' words"></span>';
               return '<span class="ms-dot ms-high" title="MuseScore info: ~' + wc + ' words"></span>';
}

// ── Site-mode visibility filter ────────────────────────────────────────────
// Canonical rule for "is this composition visible in the current site mode":
//   Public Domain mode: public_domain = 'Yes' AND a MuseScore link exists
//     (PD mode only shows works that can actually be played/viewed)
//   Copyright mode: public_domain != 'Yes', no link required
//     (copyright-mode entries are catalogue/reference records; most won't
//     have a public MuseScore link since the work can't be republished)
// Use these two together everywhere a composition list is filtered by mode,
// so the PD/Copyright inclusion rule can't drift apart page to page.
function modePdFilter(siteMode) {
  return siteMode === 'copyright' ? 'neq.Yes' : 'eq.Yes';
}
function modeLinkParam(siteMode) {
  return siteMode === 'copyright' ? '' : '&musescore_link=not.is.null';
}
