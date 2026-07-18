const SB   = 'https://tfqnzszyjsdgdeksizel.supabase.co/rest/v1';
const KEY  = window.__SUPABASE_KEY__;
const H    = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`,
               'Content-Type': 'application/json', 'Prefer': 'return=representation' };

function downloadSelf() {
  const html = document.documentElement.outerHTML;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// ── API ───────────────────────────────────────────────────────────────────────

async function get(path, signal) {
  const r = await fetch(SB + path, { headers: H, signal });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

async function post(table, data) {
  const r = await fetch(`${SB}/${table}`, { method: 'POST', headers: H, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`POST ${table} → ${r.status}: ${await r.text()}`);
  const j = await r.json(); return Array.isArray(j) ? j[0] : j;
}

async function patch(table, filter, data) {
  const r = await fetch(`${SB}/${table}?${filter}`, { method: 'PATCH', headers: H, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`PATCH ${table} → ${r.status}: ${await r.text()}`);
  return r.status;
}

async function del(table, filter) {
  const r = await fetch(`${SB}/${table}?${filter}`, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error(`DELETE ${table} → ${r.status}: ${await r.text()}`);
  return r.status;
}

// Escapes a value for safe interpolation into innerHTML template strings. Database text
// (titles, names, notes, source/publisher names, error messages) is never trusted verbatim —
// without this, a title or note containing "<" or "&" could break rendering or inject markup.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[ch]);
}

// Escapes a value for safe interpolation into a single-quoted JS string literal that itself
// sits inside a double-quoted inline onclick="..." HTML attribute (a nested context that plain
// escapeHtml doesn't fully cover, since the browser HTML-decodes the attribute before running it
// as JS — an apostrophe surviving that decode would still break out of the JS string).
function escapeJsAttr(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

let bioLoaded        = false;
let arbeidslisteLoaded = false;
let sisteLoaded      = false;

function switchTab(name) {
  if (name === 'biolinks' && !bioLoaded) loadBioPersons();
  if (name === 'arbeidsliste' && !arbeidslisteLoaded) loadArbeidsliste();
  if (name === 'siste' && !sisteLoaded) loadSiste();
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('onclick') === `switchTab('${name}')`);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${name}`);
  });
}

// ── Person lookup factory ─────────────────────────────────────────────────────

async function openComposerScores(personId, name) {
  const cc = await get(`/composition_person?person_id=eq.${personId}&select=composition_id&limit=100`);
  const ids = cc.map(r => r.composition_id).join(',');
  const comps = ids ? (await get(`/composition?composition_id=in.(${ids})&select=composition_id,title,year_composed,public_domain,musescore_link`)).sort((a,b) => (a.title||'').localeCompare(b.title||'')) : [];
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';
  const box = document.createElement('div');
  box.style.cssText = 'background:white;border-radius:8px;padding:1.5rem;max-width:600px;width:90%;max-height:80vh;overflow-y:auto';
  box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
    <h3 style="margin:0;font-size:1rem">${escapeHtml(name)} — ${comps.length} komposisjoner</h3>
    <button type="button" onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer">✕</button>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
    <tr style="border-bottom:2px solid #eee"><th style="text-align:left;padding:0.3rem">Tittel</th><th>År</th><th>PD</th><th>MS</th></tr>
    ${comps.map(c => `<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:0.3rem">${escapeHtml(c.title)}</td>
      <td style="text-align:center;color:#666">${escapeHtml(c.year_composed||'—')}</td>
      <td style="text-align:center">${c.public_domain==='Yes'?'✓':''}</td>
      <td style="text-align:center">${c.musescore_link?`<a href="${escapeHtml(c.musescore_link)}" target="_blank" rel="noopener noreferrer">🔗</a>`:''}</td>
    </tr>`).join('')}
  </table>`;
  modal.className = 'modal-overlay';
  modal.appendChild(box);
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  document.body.appendChild(modal);
}

function makeLookup(searchId, resultsId, tagsId, list, modalTarget) {
  const inp = document.getElementById(searchId);
  const res = document.getElementById(resultsId);
  let t, controller;

  inp.addEventListener('input', () => {
    clearTimeout(t);
    const q = inp.value.trim();
    if (q.length < 2) { res.classList.remove('open'); return; }
    t = setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      let rows;
      try {
        rows = await get(`/person?last_name=ilike.${encodeURIComponent(q)}*&select=person_id,first_name,last_name,nationality,born,died,pseudonym&limit=12&order=last_name`, controller.signal);
      } catch (err) {
        if (err.name === 'AbortError') return;
        throw err;
      }
      res.innerHTML = '';
      rows.forEach(p => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        const flag = p.nationality ? countryCodeToFlag(p.nationality) : '';
        const years = p.born ? ` ${p.born}${p.died ? '–'+p.died : ''}` : '';
        const d = document.createElement('div');
        d.className = 'lookup-item';
        d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:0.5rem';
        const left = document.createElement('span');
        left.innerHTML = `${flag} ${escapeHtml(name)}<span style="color:var(--muted);font-size:0.8rem">${escapeHtml(years)}</span>`;
        left.style.cursor = 'pointer';
        left.onclick = () => { addTag(p.person_id, name, tagsId, list, '', p.pseudonym || ''); inp.value = ''; res.classList.remove('open'); };
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '🎵';
        btn.title = 'Se scores';
        btn.style.cssText = 'background:none;border:1px solid var(--border);border-radius:4px;padding:0 0.4rem;cursor:pointer;font-size:0.85rem;flex-shrink:0';
        btn.onclick = (e) => { e.stopPropagation(); openComposerScores(p.person_id, name); inp.value = ''; res.classList.remove('open'); };
        d.appendChild(left);
        d.appendChild(btn);
        res.appendChild(d);
      });
      const add = document.createElement('div');
      add.className = 'lookup-item add-new';
      add.textContent = `+ Legg til "${q}" som ny person`;
      add.onclick = () => { openPersonModal(q, tagsId, list); inp.value = ''; res.classList.remove('open'); };
      res.appendChild(add);
      res.classList.add('open');
    }, 250);
  });

  document.addEventListener('click', e => {
    if (!inp.contains(e.target) && !res.contains(e.target)) res.classList.remove('open');
  });
}

function addTag(pid, name, tagsId, list, creditedAs, pseudonyms) {
  if (list.find(x => x.person_id === pid)) return;
  list.push({ person_id: pid, name, credited_as: creditedAs || '', pseudonyms: pseudonyms || '' });
  renderTags(tagsId, list);
}

function renderTags(tagsId, list) {
  const c = document.getElementById(tagsId);
  c.innerHTML = '';
  list.forEach((p, i) => {
    const t = document.createElement('div');
    t.className = 'tag';
    t.style.cssText = 'display:inline-flex;align-items:center;gap:0.35rem;padding:0.25rem 0.5rem;flex-wrap:wrap';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    nameSpan.style.cursor = 'pointer';
    nameSpan.title = 'Vis komposisjoner';
    nameSpan.onclick = () => openComposerScores(p.person_id, p.name);

    // Build pseudonym dropdown
    const pseudoList = (p.pseudonyms || '').split(',').map(s => s.trim()).filter(Boolean);
    let creditedEl;
    if (pseudoList.length > 0) {
      creditedEl = document.createElement('select');
      creditedEl.title = 'Velg pseudonym brukt på dette noteeksemplaret';
      creditedEl.style.cssText = 'font-size:0.78rem;padding:0.15rem 0.35rem;border:1px dashed var(--border);border-radius:3px;background:white;color:var(--ink);font-family:inherit;font-weight:400;max-width:150px';
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = 'Brukt pseudonym…';
      creditedEl.appendChild(blank);
      pseudoList.forEach(ps => {
        const opt = document.createElement('option');
        opt.value = ps;
        opt.textContent = ps;
        if (ps === p.credited_as) opt.selected = true;
        creditedEl.appendChild(opt);
      });
      if (p.credited_as && !pseudoList.includes(p.credited_as)) {
        // credited_as was saved but not in pseudonym list — show it anyway
        const opt = document.createElement('option');
        opt.value = p.credited_as;
        opt.textContent = p.credited_as;
        opt.selected = true;
        creditedEl.appendChild(opt);
      }
      creditedEl.onchange = () => { list[i].credited_as = creditedEl.value; };
    } else {
      creditedEl = document.createElement('input');
      creditedEl.type = 'text';
      creditedEl.value = p.credited_as || '';
      creditedEl.placeholder = 'Brukt pseudonym…';
      creditedEl.title = 'Fyll inn hvis et pseudonym er brukt på dette noteeksemplaret';
      creditedEl.style.cssText = 'width:130px;font-size:0.78rem;padding:0.15rem 0.35rem;border:1px dashed var(--border);border-radius:3px;background:white;color:var(--ink);font-family:inherit;font-weight:400';
      creditedEl.oninput = () => { list[i].credited_as = creditedEl.value.trim(); };
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '×';
    delBtn.onclick = () => { list.splice(i,1); renderTags(tagsId, list); };

    t.appendChild(nameSpan);
    t.appendChild(creditedEl);
    t.appendChild(delBtn);
    c.appendChild(t);
  });
}

// ── Credited-as field helper ──────────────────────────────────────────────────

// prefix = 'e' or 'n', idx = row index, pseudonyms = comma-separated string, current = saved value
function renderCreditedAsField(prefix, idx, pseudonyms, current) {
  const wrap = document.getElementById(`${prefix}_ccredited_wrap_${idx}`);
  if (!wrap) return;
  wrap.innerHTML = '';
  const list = prefix === 'e' ? eContributors : nContributors;
  const c = list.find(x => x.idx === idx);

  const pseudoList = (pseudonyms||'').split(',').map(s => s.trim()).filter(Boolean);

  if (pseudoList.length > 0) {
    const sel = document.createElement('select');
    sel.style.cssText = 'width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;border:1px dashed var(--border);border-radius:4px;background:white;font-family:inherit';
    sel.title = 'Pseudonym brukt på dette eksemplaret';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— Kreditert som (pseudonym) —';
    sel.appendChild(blank);
    pseudoList.forEach(ps => {
      const opt = document.createElement('option');
      opt.value = ps; opt.textContent = ps;
      if (ps === current) opt.selected = true;
      sel.appendChild(opt);
    });
    if (current && !pseudoList.includes(current)) {
      const opt = document.createElement('option');
      opt.value = current; opt.textContent = current; opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = () => { if (c) c.credited_as = sel.value; };
    wrap.appendChild(sel);
  } else {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = current || '';
    inp.placeholder = 'Kreditert som (valgfritt)…';
    inp.style.cssText = 'width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;border:1px dashed var(--border);border-radius:4px;background:white;font-family:inherit';
    inp.title = 'Fyll inn hvis personen er kreditert under et annet navn på dette eksemplaret';
    inp.oninput = () => { if (c) c.credited_as = inp.value.trim(); };
    wrap.appendChild(inp);
  }
}

// ── "Translates" picker (for role = Translator) ──────────────────────────────

// Returns the other rows in this contributor list currently set to role = Lyricist
function getLyricistCandidates(prefix, contributors, excludeIdx) {
  return contributors
    .filter(c => c.idx !== excludeIdx && c.person_id)
    .map(c => ({ ...c, _role: document.getElementById(`${prefix}_crole_${c.idx}`)?.value }))
    .filter(c => c._role === 'Lyricist');
}

// Shows/hides and (re)populates the "oversetter teksten til…" dropdown for a row,
// based on its current role. Call again after adding/removing rows if a translator
// row was set up before its lyricist row existed, to refresh the candidate list.
function updateTranslatesField(prefix, idx) {
  const contributors = prefix === 'e' ? eContributors : nContributors;
  const c = contributors.find(x => x.idx === idx);
  const roleSel = document.getElementById(`${prefix}_crole_${idx}`);
  const wrap = document.getElementById(`${prefix}_ctranslates_wrap_${idx}`);
  if (!roleSel || !wrap || !c) return;

  if (roleSel.value !== 'Translator') {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    c.translates_person_id = null;
    return;
  }

  const candidates = getLyricistCandidates(prefix, contributors, idx);
  wrap.innerHTML = '';

  if (candidates.length === 1) {
    // Only one lyricist on this composition — no ambiguity, so just use it.
    c.translates_person_id = candidates[0].person_id;
    const note = document.createElement('div');
    note.style.cssText = 'font-size:0.82rem;color:var(--muted);padding:0.3rem 0';
    note.textContent = `Oversetter teksten til ${candidates[0].name}`;
    wrap.appendChild(note);
    const refresh = document.createElement('span');
    refresh.textContent = '↻ oppdater liste';
    refresh.title = 'Oppdater listen over tekstforfattere';
    refresh.style.cssText = 'display:inline-block;font-size:0.75rem;color:var(--muted);cursor:pointer;text-decoration:underline';
    refresh.onclick = () => updateTranslatesField(prefix, idx);
    wrap.appendChild(refresh);
    wrap.style.display = 'block';
    return;
  }

  const sel = document.createElement('select');
  sel.style.cssText = 'width:100%;font-size:0.82rem;padding:0.3rem 0.5rem;border:1px dashed var(--border);border-radius:4px;background:white;font-family:inherit';
  sel.title = 'Hvilken tekstforfatters tekst blir oversatt';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = candidates.length ? '— oversetter teksten til —' : '— legg til tekstforfatteren først —';
  sel.appendChild(blank);
  candidates.forEach(cand => {
    const opt = document.createElement('option');
    opt.value = cand.person_id;
    opt.textContent = cand.name || `#${cand.person_id}`;
    if (c.translates_person_id === cand.person_id) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = () => { c.translates_person_id = parseInt(sel.value) || null; };
  wrap.appendChild(sel);

  // Small refresh link, in case the lyricist row was added/edited after this one
  const refresh = document.createElement('span');
  refresh.textContent = '↻ oppdater liste';
  refresh.title = 'Oppdater listen over tekstforfattere';
  refresh.style.cssText = 'display:inline-block;margin-top:0.2rem;font-size:0.75rem;color:var(--muted);cursor:pointer;text-decoration:underline';
  refresh.onclick = () => updateTranslatesField(prefix, idx);
  wrap.appendChild(refresh);

  wrap.style.display = 'block';
}



function makePubLookup(searchId, resultsId, hiddenId, stateObj, key) {
  const inp = document.getElementById(searchId);
  const res = document.getElementById(resultsId);
  let t, controller;

  inp.addEventListener('input', () => {
    clearTimeout(t);
    stateObj[key] = null;
    document.getElementById(hiddenId).value = '';
    const q = inp.value.trim();
    if (q.length < 2) { res.classList.remove('open'); return; }
    t = setTimeout(async () => {
      controller?.abort();
      controller = new AbortController();
      let rows;
      try {
        rows = await get(`/publisher?publisher_name=ilike.*${encodeURIComponent(q)}*&select=publisher_id,publisher_name&limit=10&order=publisher_name`, controller.signal);
      } catch (err) {
        if (err.name === 'AbortError') return;
        throw err;
      }
      res.innerHTML = '';
      rows.forEach(p => {
        const d = document.createElement('div');
        d.className = 'lookup-item';
        d.textContent = p.publisher_name;
        d.onclick = () => {
          inp.value = p.publisher_name;
          stateObj[key] = p.publisher_id;
          document.getElementById(hiddenId).value = p.publisher_id;
          res.classList.remove('open');
        };
        res.appendChild(d);
      });
      const add = document.createElement('div');
      add.className = 'lookup-item add-new';
      add.textContent = `+ Bruk "${q}" (legges til automatisk)`;
      add.onclick = () => { inp.value = q; stateObj[key] = null; res.classList.remove('open'); };
      res.appendChild(add);
      res.classList.add('open');
    }, 250);
  });

  document.addEventListener('click', e => {
    if (!inp.contains(e.target) && !res.contains(e.target)) res.classList.remove('open');
  });
}

// Shared publisher resolution used by both Ny innføring and Rediger: returns an existing
// publisher_id (case/whitespace-insensitive name match) or creates a new publisher row.
async function resolveOrCreatePublisher(name, existingId) {
  if (existingId) return existingId;
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const existing = await get(`/publisher?publisher_name=ilike.${encodeURIComponent(trimmed)}&select=publisher_id`);
  if (existing.length > 0) return existing[0].publisher_id;
  const np = await post('publisher', { publisher_name: trimmed });
  return np.publisher_id;
}

// ── Add person modal ──────────────────────────────────────────────────────────

let modalTarget = null;

function openPersonModal(prefill, tagsId, list) {
  modalTarget = { tagsId, list };
  ['m_firstName','m_lastName','m_born','m_died','m_bioUrl','m_nationality'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('m_gender').value = '';
  document.getElementById('m_bioUrlVerified').checked = false;
  document.getElementById('m_bioLink').style.display = 'none';
  const parts = prefill.trim().split(/\s+/);
  if (parts.length >= 2) {
    document.getElementById('m_firstName').value = parts.slice(0,-1).join(' ');
    document.getElementById('m_lastName').value  = parts[parts.length-1];
  } else {
    document.getElementById('m_lastName').value = prefill;
  }
  document.getElementById('addPersonModal').classList.add('open');
}

function closePersonModal() {
  document.getElementById('addPersonModal').classList.remove('open');
  modalTarget = null;
}

async function saveNewPerson() {
  const last  = document.getElementById('m_lastName').value.trim();
  const first = document.getElementById('m_firstName').value.trim();
  if (!last) { alert('Etternavn er påkrevd.'); return; }

  // Duplicate check — query by last name, then look for name overlap
  const existing = await get(`/person?last_name=ilike.${encodeURIComponent(last)}&select=person_id,first_name,last_name,born,died,pseudonym`);
  const matches = existing.filter(p => personNameOverlap(first, last, p));

  if (matches.length) {
    const lines = matches.map(p => {
      const fn = ((p.first_name || '') + ' ' + p.last_name).trim();
      const yrs = p.born ? ` (${p.born}${p.died ? '–'+p.died : ''})` : '';
      return `• ${fn}${yrs}  [ID ${p.person_id}]`;
    }).join('<br>');
    // Show inline warning and block save unless checkbox ticked
    let warn = document.getElementById('m_dupWarn');
    if (!warn) {
      warn = document.createElement('div');
      warn.id = 'm_dupWarn';
      warn.style.cssText = 'margin-top:0.75rem;background:#fff8e8;border:1px solid #e8c84a;border-radius:4px;padding:0.6rem 0.85rem;font-size:0.85rem;color:#5a4a00';
      document.querySelector('#addPersonModal .modal-actions').before(warn);
    }
    warn.innerHTML = '<div style="font-weight:600;margin-bottom:0.35rem">&#9888; Person med dette navnet finnes allerede:</div>'
      + '<div style="margin-bottom:0.5rem">' + lines + '</div>'
      + '<div style="display:flex;align-items:center;gap:0.5rem">'
      + '<input type="checkbox" id="m_notDuplicate" style="width:auto;margin:0;accent-color:var(--accent)">'
      + '<label for="m_notDuplicate" style="margin:0;text-transform:none;font-size:0.85rem;letter-spacing:0;font-weight:500;color:#5a4a00;cursor:pointer">Dette er ikke et duplikat — opprett likevel</label>'
      + '</div>';
    warn.style.display = 'block';
    if (!document.getElementById('m_notDuplicate')?.checked) return;
  }
  // Hide warning if shown from a previous attempt
  const prevWarn = document.getElementById('m_dupWarn');
  if (prevWarn) prevWarn.style.display = 'none';

  const gender        = document.getElementById('m_gender').value;
  const nationality   = document.getElementById('m_nationality').value.trim() || null;
  const birth_country         = document.getElementById('m_birth_country').value.trim() || null;
  const birth_country_primary = document.getElementById('m_birth_country_primary').checked;
  const data = {
    first_name: first || null,
    last_name:  last,
    born:       parseInt(document.getElementById('m_born').value)  || null,
    died:       parseInt(document.getElementById('m_died').value)  || null,
    nationality,
    birth_country,
    birth_country_primary,
    gender:     gender || null,
    bio_url:    document.getElementById('m_bioUrl').value.trim()   || null,
    bio_url_verified: document.getElementById('m_bioUrlVerified').checked || false,
  };
  try {
    const p = await post('person', data);
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ');
    if (modalTarget) addTag(p.person_id, name, modalTarget.tagsId, modalTarget.list);
    closePersonModal();
  } catch(e) { alert('Feil: ' + e.message); }
}

// Helper: returns true if two persons likely have overlapping names.
// Handles exact match, missing first name, and initial match (e.g. "R." vs "Rudolf").
function personNameOverlap(newFirst, newLast, existing) {
  if (existing.last_name.toLowerCase() !== newLast.toLowerCase()) return false;
  const ef = (existing.first_name || '').toLowerCase().trim();
  const nf = newFirst.toLowerCase().trim();
  if (!ef || !nf) return true;                          // one side has no first name
  if (ef === nf)  return true;                          // exact match
  // Initial match: "r." matches "rudolf", or "rudolf" matches "r."
  const efInit = ef.replace(/\.$/, '');
  const nfInit = nf.replace(/\.$/, '');
  if (efInit.length === 1 && nfInit.startsWith(efInit)) return true;
  if (nfInit.length === 1 && efInit.startsWith(nfInit)) return true;
  return false;
}

// ── Source cache ──────────────────────────────────────────────────────────────

// name -> id map for source lookup
const sourceMap = new Map();

async function loadSources() {
  const rows = await get('/source?select=source_id,source_name&order=source_name');
  const dl = document.getElementById('sourceList');
  rows.forEach(r => { if (r.source_name) sourceMap.set(r.source_name.trim(), r.source_id); });
  dl.innerHTML = [...sourceMap.keys()].sort().map(s => `<option value="${s}">`).join('');
}

function getSourceId(name) {
  const match = findSourceMatch(name);
  return match ? sourceMap.get(match) : null;
}

// Case/whitespace-insensitive lookup: returns the actual stored key if a case-insensitive
// match exists in sourceMap, or null if this source name is genuinely new.
function findSourceMatch(name) {
  const trimmed = name.trim();
  if (sourceMap.has(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const key of sourceMap.keys()) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

function validateSource(inputId) {
  const val = document.getElementById(inputId).value.trim();
  if (!val) return true; // empty is fine
  if (sourceMap.has(val)) return true;
  return confirm(`"${val}" er ikke en kjent kilde.\n\nKlikk OK for å lagre likevel, eller Avbryt for å velge en eksisterende kilde.`);
}
loadSources();

// ── NEW ENTRY ─────────────────────────────────────────────────────────────────

const nContributors = [];
const nPubState   = {};
const nRowIdxRef  = { value: 0 };
function nAddContributorRow(person, role, creditedAs, translatesPersonId) { addContributorRow('n', nContributors, nRowIdxRef, person, role, creditedAs||'', translatesPersonId); }

const ROLES = ['Composer','Lyricist','Arranger','Illustrator','Translator'];
const ROLE_NO = { Composer:'Komponist', Lyricist:'Tekstforfatter', Arranger:'Arrangør', Illustrator:'Illustratør', Translator:'Oversetter' };


// ── Shared contributor row factory ────────────────────────────────────────────

function addContributorRow(prefix, contributors, rowIdxRef, person, role, creditedAs, translatesPersonId) {
  role = role || 'Composer';
  const idx = rowIdxRef.value++;
  const name = person ? [person.first_name||'', person.last_name||''].filter(Boolean).join(' ') : null;
  const list = document.getElementById(`${prefix}_contributorList`);
  const div = document.createElement('div');
  div.id = `${prefix}_crow_${idx}`;
  div.style.cssText = 'display:flex;align-items:flex-start;gap:0.5rem;margin-bottom:0.5rem;padding:0.5rem;background:var(--warm);border-radius:5px';
  div.innerHTML = `
    <div style="flex:1">
      <select id="${prefix}_crole_${idx}" style="width:100%;margin-bottom:0.3rem;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:4px;font-size:0.85rem;font-family:inherit">
        ${ROLES.map(r => `<option value="${r}"${r===role?' selected':''}>${ROLE_NO[r]}</option>`).join('')}
      </select>
      <div style="position:relative">
        <input type="text" id="${prefix}_csearch_${idx}" placeholder="Søk etter person…" autocomplete="off"
          style="width:100%;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:4px;font-size:0.85rem">
        <div id="${prefix}_cresults_${idx}" class="lookup-results"></div>
      </div>
      <div id="${prefix}_cselected_${idx}" style="font-size:0.82rem;color:var(--accent);margin-top:0.2rem;font-weight:500">${escapeHtml(name||'')}</div>
      <div id="${prefix}_ccredited_wrap_${idx}" style="margin-top:0.3rem"></div>
      <div id="${prefix}_ctranslates_wrap_${idx}" style="display:none;margin-top:0.3rem"></div>
    </div>
    <button type="button" id="${prefix}_cremove_${idx}" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--muted);padding:0.2rem;line-height:1;margin-top:1.8rem">✕</button>`;
  list.appendChild(div);
  contributors.push({ idx, person_id: person?.person_id||null, name, credited_as: creditedAs||'', translates_person_id: translatesPersonId||null });
  if (person) {
    renderCreditedAsField(prefix, idx, person.pseudonym||'', creditedAs||'');
  }

  // Role select: show/hide the "translates" picker
  document.getElementById(`${prefix}_crole_${idx}`).addEventListener('change', () => updateTranslatesField(prefix, idx));
  updateTranslatesField(prefix, idx);

  // Remove button
  document.getElementById(`${prefix}_cremove_${idx}`).addEventListener('click', () => {
    document.getElementById(`${prefix}_crow_${idx}`)?.remove();
    const i = contributors.findIndex(c => c.idx === idx);
    if (i !== -1) contributors.splice(i, 1);
  });

  // Search input
  let searchTimer, searchController;
  document.getElementById(`${prefix}_csearch_${idx}`).addEventListener('input', function() {
    clearTimeout(searchTimer);
    const val = this.value;
    const res = document.getElementById(`${prefix}_cresults_${idx}`);
    if (val.length < 2) { res.innerHTML = ''; res.style.display = 'none'; return; }
    searchTimer = setTimeout(async () => {
      searchController?.abort();
      searchController = new AbortController();
      let rows;
      try {
        rows = await get(`/person?last_name=ilike.${encodeURIComponent(val)}*&select=person_id,first_name,last_name,born,died&order=last_name.asc&limit=10`, searchController.signal);
      } catch (err) {
        if (err.name === 'AbortError') return;
        throw err;
      }
      if (!rows.length) { res.innerHTML = ''; res.style.display = 'none'; return; }
      res.style.display = 'block';
      res.innerHTML = rows.map(p => {
        const pname = [p.first_name,p.last_name].filter(Boolean).join(' ');
        const dates = p.born||p.died ? ` (${[p.born,p.died].filter(Boolean).join('–')})` : '';
        return `<div class="lookup-item" data-pid="${p.person_id}" data-name="${escapeHtml(pname)}"><span class="lookup-name">${escapeHtml(pname)}</span><span class="lookup-meta">${escapeHtml(dates)}</span></div>`;
      }).join('');
      // Wire result clicks
      res.querySelectorAll('.lookup-item').forEach(item => {
        item.addEventListener('click', async () => {
          const personId = parseInt(item.dataset.pid);
          const pname    = item.dataset.name;
          const c = contributors.find(x => x.idx === idx);
          if (c) { c.person_id = personId; c.name = pname; c.credited_as = ''; }
          document.getElementById(`${prefix}_csearch_${idx}`).value = '';
          res.style.display = 'none';
          document.getElementById(`${prefix}_cselected_${idx}`).textContent = pname;
          try {
            const pr = await get(`/person?person_id=eq.${personId}&select=pseudonym`);
            renderCreditedAsField(prefix, idx, pr[0]?.pseudonym||'', '');
          } catch(e) { renderCreditedAsField(prefix, idx, '', ''); }
        });
      });
    }, 250);
  });
}

// Add default composer row on load
nAddContributorRow(null, 'Composer');

makePubLookup('n_publisherSearch', 'n_publisherResults', 'n_publisherId', nPubState, 'id');

function showMsg(tabId, text, type) {
  const el = document.getElementById(tabId);
  el.textContent = text;
  el.className = 'msg' + (type ? ' ' + type : '');
}

document.getElementById('newForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msgEl = document.getElementById('newMsg');
  const btn = document.getElementById('newSubmitBtn');
  if (btn.disabled) return; // already mid-submit — ignore extra clicks entirely
  btn.disabled = true; // disabled synchronously, before any await, so a rapid second click can't slip in
  const resetBtn = () => { btn.disabled = false; btn.textContent = 'Lagre innføring'; };
  try {
    // Duplicate-title gate
    const warnVisible = document.getElementById('n_duplicateWarn').style.display !== 'none';
    if (warnVisible && !document.getElementById('n_notDuplicate').checked) {
      showMsg('newMsg', '⚠ Mulige duplikater funnet — bekreft at dette ikke er et duplikat før du lagrer.', 'error');
      msgEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      resetBtn();
      return;
    }
    showMsg('newMsg', '', '');

    // 1. Freeze every field value up front, before any async gaps or confirmations,
    //    so nothing can change out from under us while a warning is pending.
    const data = {
      title:         document.getElementById('n_title').value.trim(),
      year:          document.getElementById('n_year').value.trim(),
      cat:           document.getElementById('n_category').value,
      notes:         document.getElementById('n_notes').value.trim(),
      dedication:    document.getElementById('n_dedication').value.trim(),
      msLink:        document.getElementById('n_msLink').value.trim(),
      opus:          document.getElementById('n_opus').value.trim(),
      toInvestigate: document.getElementById('n_toInvestigate').checked,
      underArbeid:   document.getElementById('n_underArbeid').checked,
      uploadedToday: document.getElementById('n_uploadedToday').checked,
      plate:         document.getElementById('n_plateNumber').value.trim(),
      publisherName: document.getElementById('n_publisherSearch').value.trim(),
      publisherId:   nPubState.id,
      yearPublished: document.getElementById('n_yearPublished').value.trim(),
      pdfUrl:        document.getElementById('n_pdfUrl').value.trim(),
      mp3Url:        document.getElementById('n_mp3Url').value.trim(),
      source:        document.getElementById('n_source').value.trim(),
      hasFrontpage:  document.getElementById('n_hasFrontpage').checked,
      aiFrontpage:   document.getElementById('n_aiFrontpage').checked,
      contributors:  nContributors.map(c => ({
        ...c,
        role: document.getElementById(`n_crole_${c.idx}`)?.value || 'Composer',
      })),
    };

    if (!data.title) { showMsg('newMsg', 'Feil: Tittel er påkrevd.', 'error'); msgEl.scrollIntoView({behavior:'smooth',block:'center'}); resetBtn(); return; }
    if (!data.cat)   { showMsg('newMsg', 'Feil: Kategori er påkrevd.', 'error'); msgEl.scrollIntoView({behavior:'smooth',block:'center'}); resetBtn(); return; }

    // 2. Contributor completeness — a name typed but never selected from the list
    //    would otherwise be silently dropped.
    for (const c of data.contributors) {
      const searchVal = document.getElementById(`n_csearch_${c.idx}`)?.value.trim();
      if (searchVal && !c.person_id) {
        showMsg('newMsg', `Feil: En bidragsyterrad har et navn skrevet inn ("${searchVal}"), men ingen person er valgt fra listen. Velg en person fra søkeresultatene, eller tøm feltet.`, 'error');
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        resetBtn();
        return;
      }
    }

    // 3. Source validation — decide now whether an unknown source will be created,
    //    rather than silently discarding it later.
    let sourceIsNew = false;
    if (data.source && !findSourceMatch(data.source)) {
      const proceed = confirm(`"${data.source}" er ikke en kjent kilde.\n\nKlikk OK for å opprette den som en ny kilde og lagre, eller Avbryt for å velge en eksisterende kilde.`);
      if (!proceed) { showMsg('newMsg', 'Lagring avbrutt — velg en eksisterende kilde eller bekreft oppretting av ny.', 'error'); resetBtn(); return; }
      sourceIsNew = true;
    }

    // 4. Duplicate plate-number check — scoped to the same publisher, since different
    //    publishers can legitimately reuse the same plate number. Runs BEFORE any
    //    database write, so "Avbryt" truly means nothing was saved.
    if (data.plate) {
      // Read-only publisher resolution just for this check — does NOT create a new
      // publisher row. If the publisher is new or unspecified, nothing existing could
      // share both that publisher and this plate number, so the check is skipped.
      let checkPubId = data.publisherId;
      if (!checkPubId && data.publisherName) {
        const pubLookup = await get(`/publisher?publisher_name=ilike.${encodeURIComponent(data.publisherName)}&select=publisher_id`);
        checkPubId = pubLookup[0]?.publisher_id || null;
      }

      if (checkPubId) {
        const dupScores = await get(`/score?plate_number=eq.${encodeURIComponent(data.plate)}&publisher_id=eq.${checkPubId}&select=score_id,composition_id,plate_number`);
        if (dupScores.length) {
          const dupIds = dupScores.map(s => s.composition_id).join(',');
          const dupComps = await get(`/composition?composition_id=in.(${dupIds})&select=composition_id,title`);
          const titleMap = Object.fromEntries(dupComps.map(c => [c.composition_id, c.title]));
          const dupLines = dupScores.map(s => `• "${escapeHtml(titleMap[s.composition_id] || '?')}" (score_id=${s.score_id}, plate=${escapeHtml(s.plate_number)})`).join('<br>');
          msgEl.innerHTML = `<div style="background:#fff8e8;border:1px solid #e8c84a;border-radius:4px;padding:0.6rem 0.85rem;font-size:0.85rem;color:#5a4a00">
            <div style="font-weight:600;margin-bottom:0.35rem">⚠ Denne utgiveren har allerede et noteeksemplar med platenummer <em>${escapeHtml(data.plate)}</em> (ingenting er lagret ennå):</div>
            <div style="margin-bottom:0.5rem">${dupLines}</div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.4rem">
              <button id="scoreDupConfirm" class="btn" style="font-size:0.8rem;padding:0.25rem 0.6rem;background:#c8a000;color:#fff;border:none;border-radius:4px;cursor:pointer">Lagre likevel</button>
              <button id="scoreDupCancel" class="btn btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.6rem">Avbryt</button>
            </div>
          </div>`;
          msgEl.className = 'msg';
          msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Button stays disabled while this choice is pending, so a stray click elsewhere can't start a second save.
          document.getElementById('scoreDupCancel').onclick = () => { msgEl.innerHTML = ''; resetBtn(); };
          document.getElementById('scoreDupConfirm').onclick = () => { msgEl.innerHTML = ''; performNewEntrySave(data, sourceIsNew); };
          return;
        }
      }
    }

    await performNewEntrySave(data, sourceIsNew);
  } catch (err) {
    console.error('Ny innføring — uventet feil før lagring:', err);
    showMsg('newMsg', 'Uventet feil: ' + err.message, 'error');
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    resetBtn();
  }
});


// Performs the actual writes for a new entry, after every validation gate above
// has already passed. If the score insert fails partway through, the composition
// and its contributor rows are rolled back rather than left orphaned.
async function performNewEntrySave(data, sourceIsNew) {
  const btn = document.getElementById('newSubmitBtn');
  const msgEl = document.getElementById('newMsg');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Lagrer…';

  let compId = null;
  try {
    // Publisher (create if new)
    const pubId = await resolveOrCreatePublisher(data.publisherName, data.publisherId);

    // Source (create if new & confirmed above) — source_id is manually assigned, not autoincrement
    let sourceId = null;
    if (data.source) {
      sourceId = sourceIsNew ? await ensureSourceId(data.source) : getSourceId(data.source);
    }

    const pubDomain = data.cat === 'pd' ? 'Yes' : 'No';
    const today = new Date().toISOString().slice(0,10);

    const comp = await post('composition', {
      title: data.title, public_domain: pubDomain, year_composed: data.year || null,
      opus_number: data.opus || null, composition_notes: data.notes || null,
      musescore_link: data.msLink || null, dedication: data.dedication || null,
      to_investigate: data.toInvestigate || null, under_arbeid: data.underArbeid || null,
      musescore_uploaded: data.uploadedToday ? today : null,
    });
    compId = comp.composition_id;
    if (!compId) throw new Error('Feil ved lagring av komposisjon.');

    for (const c of data.contributors) {
      if (!c.person_id) continue;
      await post('composition_person', { composition_id: compId, person_id: c.person_id, role: c.role, credited_as: c.credited_as || null, translates_person_id: c.role === 'Translator' ? (c.translates_person_id || null) : null });
    }

    await post('score', {
      composition_id: compId, plate_number: data.plate || null, publisher_id: pubId || null,
      year_published: data.yearPublished || null, pdf_url: data.pdfUrl || null, mp3_url: data.mp3Url || null,
      source_id: sourceId || null, has_frontpage: data.hasFrontpage, ai_frontpage: data.aiFrontpage,
    });

    showMsg('newMsg', `✓ "${data.title}" er lagret (id=${compId})`, 'success');
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    resetNewForm();
  } catch(err) {
    // Best-effort rollback so a failed score insert never leaves a half-saved entry behind.
    let rolledBack = false;
    if (compId) {
      try {
        await del('composition_person', `composition_id=eq.${compId}`);
        await del('composition', `composition_id=eq.${compId}`);
        rolledBack = true;
      } catch (cleanupErr) {
        console.error('Rollback failed:', cleanupErr);
      }
    }
    showMsg('newMsg', `Feil: ${err.message}${rolledBack ? ' — hele innføringen ble rullet tilbake, ingenting ble lagret.' : (compId ? ' — ADVARSEL: opprydding feilet også, sjekk komposisjon id=' + compId + ' manuelt.' : '')}`, 'error');
    msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  btn.disabled = false; btn.textContent = 'Lagre innføring';
}

// Returns the source_id for a name, creating a new source row (with the next
// manually-assigned id, since source_id is not autoincrement) if it doesn't exist yet.
async function ensureSourceId(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const match = findSourceMatch(trimmed);
  if (match) return sourceMap.get(match);

  // source_id is manually assigned (not autoincrement), so two near-simultaneous creates
  // could compute the same "next" id. Retry once against a fresh max if that happens.
  // NOTE: the only real fix is making source_id an identity/sequence column in Postgres —
  // this is a mitigation, not a guarantee, for the current schema.
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await get(`/source?select=source_id&order=source_id.desc&limit=1`);
    const nextId = (existing[0]?.source_id || 0) + 1;
    try {
      await post('source', { source_id: nextId, source_name: trimmed });
      sourceMap.set(trimmed, nextId);
      const dl = document.getElementById('sourceList');
      if (dl) dl.innerHTML = [...sourceMap.keys()].sort().map(s => `<option value="${s}">`).join('');
      return nextId;
    } catch (err) {
      const isConflict = /409|23505|duplicate/i.test(err.message);
      if (isConflict && attempt === 0) continue; // someone else took nextId — retry once
      throw err;
    }
  }
}

function resetNewForm() {
  document.getElementById('newForm').reset();
  document.getElementById('n_toInvestigate').checked = false;
  document.getElementById('n_underArbeid').checked = false;
  nPubState.id = null;
  nContributors.length = 0;
  nRowIdxRef.value = 0;
  document.getElementById('n_contributorList').innerHTML = '';
  nAddContributorRow(null, 'Composer');
  const pubSearch = document.getElementById('n_publisherSearch');
  if (pubSearch) pubSearch.value = '';
  hideDuplicateWarn();
}

// ── Duplicate title check ─────────────────────────────────────────────────────

function hideDuplicateWarn() {
  document.getElementById('n_duplicateWarn').style.display = 'none';
  document.getElementById('n_duplicateList').innerHTML = '';
  document.getElementById('n_notDuplicate').checked = false;
}

let dupCheckTimeout, dupCheckController;
document.getElementById('n_title').addEventListener('input', () => {
  clearTimeout(dupCheckTimeout);
  hideDuplicateWarn();
  const q = document.getElementById('n_title').value.trim();
  if (q.length < 2) return;
  dupCheckTimeout = setTimeout(async () => {
    dupCheckController?.abort();
    dupCheckController = new AbortController();
    let results;
    try {
      results = await get(`/composition?title=ilike.*${encodeURIComponent(q)}*&select=composition_id,title,year_composed,public_domain&limit=8&order=title`, dupCheckController.signal);
    } catch (err) {
      if (err.name === 'AbortError') return;
      throw err;
    }
    if (!results.length) return;
    const list = document.getElementById('n_duplicateList');
    list.innerHTML = results.map(c => {
      const year = c.year_composed ? ` (${escapeHtml(c.year_composed)})` : '';
      const pd   = c.public_domain === 'Yes' ? ' · PD' : '';
      return `<div style="padding:0.2rem 0;border-bottom:1px solid #e8d88a;display:flex;align-items:center;justify-content:space-between;gap:0.75rem">
        <span>${escapeHtml(c.title)}${year}${pd}</span>
        <a href="#" onclick="event.preventDefault();switchTab('edit');loadEditForm(${c.composition_id})"
           style="font-size:0.78rem;white-space:nowrap;color:var(--accent);text-decoration:underline">Åpne →</a>
      </div>`;
    }).join('');
    document.getElementById('n_duplicateWarn').style.display = 'block';
  }, 350);
});

// ── EDIT TAB ──────────────────────────────────────────────────────────────────

const eContributors = [];
const ePubState  = {};

// ── e (Edit tab) ─────────────────────────────────────────────────────────────
const eRowIdxRef = { value: 0 };
function eAddContributorRow(person, role, creditedAs, translatesPersonId)  { addContributorRow('e', eContributors, eRowIdxRef, person, role, creditedAs, translatesPersonId); }

makePubLookup('e_publisherSearch', 'e_publisherResults', 'e_publisherId', ePubState, 'id');

let editSearchTimeout;

function setSearchMode(mode) {
  document.getElementById('editSearchMode').value = mode;
  document.getElementById('editSearch').placeholder = mode === 'composer' ? 'Søk på komponist…' : 'Søk på tittel…';
  document.getElementById('editSearch').value = '';
  document.getElementById('editSearchResults').innerHTML = '';
  document.getElementById('searchModeComposer').style.fontWeight = mode === 'composer' ? '700' : '';
  document.getElementById('searchModeTitle').style.fontWeight    = mode === 'title'    ? '700' : '';
}

let editSearchToken = 0;

document.getElementById('editSearch').addEventListener('input', () => {
  clearTimeout(editSearchTimeout);
  const q = document.getElementById('editSearch').value.trim();
  document.getElementById('editSearchResults').innerHTML = '';
  editSearchToken++; // invalidate any in-flight search from a previous keystroke
  if (q.length < 2) return;
  const myToken = editSearchToken;
  editSearchTimeout = setTimeout(() => searchCompositions(q, myToken), 300);
});

async function searchCompositions(q, myToken) {
  const mode      = document.getElementById('editSearchMode').value;
  const container = document.getElementById('editSearchResults');
  container.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:.5rem 0">Søker…</div>';

  let results = [];

  if (mode === 'title') {
    results = await get(`/composition?title=ilike.*${encodeURIComponent(q)}*&select=composition_id,title,year_composed,public_domain,approved,musescore_link,to_investigate,under_arbeid&limit=30&order=title`);

  } else {
    // Composer mode — find persons by last name, then their compositions
    const persons = await get(`/person?last_name=ilike.${encodeURIComponent(q)}*&select=person_id,first_name,last_name&limit=10&order=last_name`);
    for (const p of persons) {
      const cc = await get(`/composition_person?person_id=eq.${p.person_id}&role=eq.Composer&select=composition_id`);
      if (!cc.length) continue;
      const ids = cc.map(r => r.composition_id).join(',');
      const comps = await get(`/composition?composition_id=in.(${ids})&select=composition_id,title,year_composed,public_domain,approved,musescore_link,to_investigate,under_arbeid`);
      comps.forEach(c => {
        if (!results.find(r => r.composition_id === c.composition_id)) {
          c._composer = [p.first_name, p.last_name].filter(Boolean).join(' ');
          c._composer_id = p.person_id;
          results.push(c);
        }
      });
    }
    results.sort((a,b) => a.title.localeCompare(b.title));
  }

  // A newer search has started since this one began — drop these stale results
  if (myToken !== editSearchToken) return;

  if (!results.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:.5rem 0">Ingen treff.</div>';
    return;
  }

  container.innerHTML = '';
  results.slice(0, 30).forEach(c => {
    const d = document.createElement('div');
    d.className = 'result-row';
    const approvedBadge    = c.approved      ? ' <span class="approved-badge">✓</span>' : '';
    const investigateBadge = c.to_investigate ? ' <span style="font-size:0.75rem;background:#fff3cd;border:1px solid #f0c040;border-radius:2px;padding:0.1rem 0.4rem;color:#7a5c00;font-weight:500;vertical-align:middle">🔍 Undersøke</span>' : '';
    const underArbeidBadge = c.under_arbeid   ? ' <span style="font-size:0.75rem;background:#fff0d6;border:1px solid #e8a000;border-radius:2px;padding:0.1rem 0.4rem;color:#7a4500;font-weight:500;vertical-align:middle">⚙ Under arbeid</span>' : '';
    const composerMeta = c._composer
      ? ` · <span style="cursor:pointer;text-decoration:underline dotted" onclick="event.stopPropagation();openComposerScores(${c._composer_id||'null'},'${escapeJsAttr(c._composer||'')}')">🎵 ${escapeHtml(c._composer)}</span>`
      : '';
    d.innerHTML = `<div class="result-title">${escapeHtml(c.title)}${approvedBadge}${investigateBadge}${underArbeidBadge}</div>
                   <div class="result-meta">${escapeHtml(c.year_composed || '—')} · ${c.public_domain === 'Yes' ? 'PD' : 'Opphavsrett'}${composerMeta}</div>`;
    if (c.approved) d.classList.add('is-approved');
    d.onclick = () => loadEditForm(c.composition_id);
    container.appendChild(d);
  });
}

async function loadEditForm(compId) {
  showMsg('editMsg', '', '');
  // Clear contributors immediately so stale data doesn't show during async fetch
  eContributors.length = 0; eRowIdxRef.value = 0;
  const el = document.getElementById('e_contributorList');
  if (el) el.innerHTML = '';
  ['e_composerTags','e_lyricistTags','e_illustratorTags'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  try {
  // Save search state so we can restore it on Back
  window._savedSearch = {
    query: document.getElementById('editSearch').value,
    mode:  document.getElementById('editSearchMode').value,
  };
  document.getElementById('editSearchResults').innerHTML = '';
  document.getElementById('editSearch').value = '';

  const [comp, cpRaw, scores] = await Promise.all([
    get(`/composition?composition_id=eq.${compId}&select=*`),
    get(`/composition_person?composition_id=eq.${compId}&select=person_id,role,credited_as,translates_person_id`),
    get(`/score?composition_id=eq.${compId}&select=*&order=score_id.desc`)
  ]);

  // Fetch person details separately
  const personIds = [...new Set(cpRaw.map(r => r.person_id))];
  let personRows = [];
  if (personIds.length) {
    personRows = await get(`/person?person_id=in.(${personIds.join(',')})&select=person_id,first_name,last_name,bio_url,pseudonym`);
  }
  const personMap = Object.fromEntries(personRows.map(p => [p.person_id, p]));
  const cp = cpRaw.map(r => ({ ...r, person: personMap[r.person_id] || null }));

  const c = comp[0];
  document.getElementById('e_compId').value  = compId;
  document.getElementById('e_title').value   = c.title || '';
  document.getElementById('e_year').value    = c.year_composed || '';
  document.getElementById('e_category').value = c.public_domain === 'Yes' ? 'pd' : 'copyright';
  document.getElementById('e_msLink').value  = c.musescore_link || '';
  document.getElementById('e_opus').value    = c.opus_number || '';
  document.getElementById('e_notes').value       = c.composition_notes || '';
  await loadTagCheckboxes(parseInt(compId));
  document.getElementById('e_dedication').value  = c.dedication || '';
  document.getElementById('e_msNotes').value = c.musescore_notes || '';
  document.getElementById('e_toInvestigate').checked = c.to_investigate || false;
  document.getElementById('e_underArbeid').checked   = c.under_arbeid   || false;
  const dcEl = document.getElementById('e_displayCountry');
  dcEl.value = c.display_country || '';
  document.getElementById('e_displayCountryFlag').textContent = c.display_country ? countryCodeToFlag(c.display_country) : '';

  eContributors.length = 0;
  eRowIdxRef.value = 0;
  document.getElementById('e_contributorList').innerHTML = '';
  for (const row of cp) {
    eAddContributorRow(row.person, row.role || 'Composer', row.credited_as || '', row.translates_person_id || null);
  }
  if (!cp.length) eAddContributorRow(null, 'Composer');
  // Now that every row exists, refresh Translator rows so their lyricist candidate lists are complete
  eContributors.forEach(c => updateTranslatesField('e', c.idx));

  const score = scores[0];
  document.getElementById('e_scoreId').value = score ? score.score_id : '';
  document.getElementById('e_plateNumber').value = score?.plate_number || '';
  document.getElementById('e_yearPublished').value = score?.year_published || '';
  document.getElementById('e_uploadedToday').checked = false;
  // Fetch publisher separately to avoid FK join issues
  if (score?.publisher_id) {
    const pubRows = await get(`/publisher?publisher_id=eq.${score.publisher_id}&select=publisher_id,publisher_name`);
    const pub = pubRows[0];
    if (pub) {
      document.getElementById('e_publisherSearch').value = pub.publisher_name;
      document.getElementById('e_publisherId').value     = pub.publisher_id;
      ePubState.id = pub.publisher_id;
    } else {
      document.getElementById('e_publisherSearch').value = '';
      document.getElementById('e_publisherId').value     = '';
      ePubState.id = null;
    }
  } else {
    document.getElementById('e_publisherSearch').value = '';
    document.getElementById('e_publisherId').value     = '';
    ePubState.id = null;
  }
  // Look up source name from source_id for display
  const srcEntry = score?.source_id ? [...sourceMap.entries()].find(([,id]) => id === score.source_id) : null;
  document.getElementById('e_source').value = srcEntry ? srcEntry[0] : '';

  // PDF / MP3 URLs
  const pdfUrl = score?.pdf_url || '';
  const mp3Url = score?.mp3_url || '';
  document.getElementById('e_pdfUrl').value = pdfUrl;
  document.getElementById('e_mp3Url').value = mp3Url;
  document.getElementById('e_hasFrontpage').checked = score?.has_frontpage || false;
  document.getElementById('e_aiFrontpage').checked  = score?.ai_frontpage  || false;
  const pdfLink = document.getElementById('e_pdfLink');
  const mp3Link = document.getElementById('e_mp3Link');
  pdfLink.href = pdfUrl || '#'; pdfLink.style.display = pdfUrl ? 'inline-block' : 'none';
  mp3Link.href = mp3Url || '#'; mp3Link.style.display = mp3Url ? 'inline-block' : 'none';

  // Sync has-value class so clear buttons appear on already-filled fields
  ['e_title','e_year','e_opus','e_msLink','e_notes','e_dedication',
   'e_msNotes','e_displayCountry','e_publisherSearch','e_plateNumber','e_source',
   'e_pdfUrl','e_mp3Url']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('has-value', el.value.length > 0);
    });

  // Approval state
  const approved = c.approved || false;
  document.getElementById('e_approved').value = approved ? 'true' : 'false';
  updateApprovalUI(approved);

  // Check links
  const linksDiv = document.getElementById('checkLinks');
  linksDiv.innerHTML = '';
  const msLink = c.musescore_link;
  const msBtn = document.createElement('a');
  msBtn.className = 'link-btn' + (msLink ? '' : ' disabled');
  msBtn.href = msLink || '#';
  msBtn.target = '_blank';
  msBtn.textContent = '🎵 MuseScore';
  linksDiv.appendChild(msBtn);

  // Composer bio links
  for (const row of cp) {
    const bioUrl = row.person?.bio_url;
    const name = [row.person?.first_name, row.person?.last_name].filter(Boolean).join(' ');
    const bioBtn = document.createElement('a');
    bioBtn.className = 'link-btn' + (bioUrl ? '' : ' disabled');
    bioBtn.href = bioUrl || '#';
    bioBtn.target = '_blank';
    bioBtn.textContent = '👤 ' + name;
    linksDiv.appendChild(bioBtn);
  }

  document.getElementById('editPanelTitle').textContent = c.title;
  document.getElementById('editPanel').classList.add('open');
  } catch(err) {
    showMsg('editMsg', 'Feil ved lasting: ' + err.message, 'error');
    console.error('loadEditForm error:', err);
  }
}

function updateApprovalUI(approved) {
  const status = document.getElementById('approvalStatus');
  const btn    = document.getElementById('approveBtn');
  if (approved) {
    status.innerHTML = '<span class="approved-badge">✓ Godkjent</span>';
    btn.textContent = '✗ Fjern godkjenning';
    btn.style.background = 'var(--muted)';
  } else {
    status.innerHTML = '<span class="unapproved-badge">Ikke godkjent</span>';
    btn.textContent = '✓ Godkjenn';
    btn.style.background = 'var(--accent2)';
  }
}

async function toggleApproval() {
  const compId  = document.getElementById('e_compId').value;
  const current = document.getElementById('e_approved').value === 'true';
  const newVal  = !current;
  try {
    await patch('composition', `composition_id=eq.${compId}`, { approved: newVal });
    document.getElementById('e_approved').value = newVal ? 'true' : 'false';
    updateApprovalUI(newVal);
    showMsg('editMsg', newVal ? '✓ Godkjent' : 'Godkjenning fjernet', 'success');
  } catch(err) {
    showMsg('editMsg', 'Feil: ' + err.message, 'error');
  }
}

async function saveEdit() {
  const btn = document.getElementById('editSaveBtn');

  // Freeze contributor roles now, before the confirm() pause below, so the save can't pick
  // up a role changed while that dialog was open (same fix applied to Ny innføring).
  const frozenContributors = eContributors.map(c => ({
    ...c,
    role: document.getElementById(`e_crole_${c.idx}`)?.value || 'Composer',
  }));

  // Validate source BEFORE touching the database or showing the spinner —
  // and remember whether it needs to be created, rather than discarding it later.
  const esource = document.getElementById('e_source').value.trim();
  let sourceIsNew = false;
  if (esource && !findSourceMatch(esource)) {
    const proceed = confirm(`"${esource}" er ikke en kjent kilde.\n\nKlikk OK for å opprette den som en ny kilde og lagre, eller Avbryt for å velge en eksisterende kilde.`);
    if (!proceed) return;
    sourceIsNew = true;
  }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Lagrer…';
  showMsg('editMsg', '', '');
  try {
    const compId = document.getElementById('e_compId').value;
    const scoreId = document.getElementById('e_scoreId').value;
    const cat = document.getElementById('e_category').value;

    await patch('composition', `composition_id=eq.${compId}`, {
      title:             document.getElementById('e_title').value.trim(),
      year_composed:     document.getElementById('e_year').value.trim() || null,
      opus_number:       document.getElementById('e_opus').value.trim() || null,
      public_domain:     cat === 'pd' ? 'Yes' : 'No',
      musescore_link:    document.getElementById('e_msLink').value.trim() || null,
      composition_notes: document.getElementById('e_notes').value.trim() || null,
      musescore_notes:    document.getElementById('e_msNotes').value.trim() || null,
      dedication:        document.getElementById('e_dedication').value.trim() || null,
      to_investigate:    document.getElementById('e_toInvestigate').checked,
      under_arbeid:      document.getElementById('e_underArbeid').checked,
      display_country:   document.getElementById('e_displayCountry').value.trim().toUpperCase() || null,
      ...(document.getElementById('e_uploadedToday').checked ? { musescore_uploaded: new Date().toISOString().slice(0,10) } : {}),
    });

    // Update contributors
    await del('composition_person', `composition_id=eq.${compId}`);
    for (const c of frozenContributors) {
      if (!c.person_id) continue;
      await post('composition_person', { composition_id: parseInt(compId), person_id: c.person_id, role: c.role, credited_as: c.credited_as || null, translates_person_id: c.role === 'Translator' ? (c.translates_person_id || null) : null });
    }

    // Update tags
    await del('composition_tag', `composition_id=eq.${compId}`);
    for (const cb of [...document.querySelectorAll('#e_tagCheckboxes input[type=checkbox]:checked')]) {
      await post('composition_tag', { composition_id: parseInt(compId), tag_id: parseInt(cb.value) });
    }

    // Update score
    const pubId   = await resolveOrCreatePublisher(document.getElementById('e_publisherSearch').value.trim(), ePubState.id);
    const plate   = document.getElementById('e_plateNumber').value.trim();
    const sourceId = esource ? (sourceIsNew ? await ensureSourceId(esource) : getSourceId(esource)) : null;
    const scoreData = { plate_number: plate||null, publisher_id: pubId||null, year_published: document.getElementById('e_yearPublished').value.trim()||null, pdf_url: document.getElementById('e_pdfUrl').value.trim()||null, mp3_url: document.getElementById('e_mp3Url').value.trim()||null, source_id: sourceId||null, has_frontpage: document.getElementById('e_hasFrontpage').checked, ai_frontpage: document.getElementById('e_aiFrontpage').checked };

    if (scoreId) {
      await patch('score', `score_id=eq.${scoreId}`, scoreData);
    } else {
      await post('score', { composition_id: parseInt(compId), ...scoreData });
    }

    showMsg('editMsg', `✓ Endringer lagret`, 'success');
  } catch(err) {
    showMsg('editMsg', 'Feil: ' + err.message, 'error');
  }
  btn.disabled = false; btn.textContent = 'Lagre endringer';
}

async function deleteComposition() {
  const compId = document.getElementById('e_compId').value;
  const title  = document.getElementById('e_title').value;
  if (!confirm(`Slette "${title}"? Dette kan ikke angres.`)) return;
  try {
    await del('composition_person',  `composition_id=eq.${compId}`);
    await del('score',                `composition_id=eq.${compId}`);
    await del('composition',          `composition_id=eq.${compId}`);
    closeEditPanel();
    showMsg('editMsg', `✓ "${title}" er slettet.`, 'success');
  } catch(err) {
    showMsg('editMsg', 'Feil: ' + err.message, 'error');
  }
}

function closeEditPanel() {
  document.getElementById('editPanel').classList.remove('open');
  eContributors.length = 0; eRowIdxRef.value = 0; ePubState.id = null;
  document.getElementById('e_contributorList').innerHTML = '';
  ['e_composerTags','e_lyricistTags','e_illustratorTags'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });

  // Reset tag dropdown
  const dd  = document.getElementById('e_tagCheckboxes');
  const lbl = document.getElementById('e_tagDropdownLabel');
  if (dd)  { dd.innerHTML = ''; dd.style.display = 'none'; }
  if (lbl) lbl.textContent = 'Ingen tagger valgt';

  // Restore previous search state
  if (window._savedSearch) {
    const s = window._savedSearch;
    setSearchMode(s.mode || 'composer');
    document.getElementById('editSearch').value = s.query;
    if (s.query.length >= 2) {
      searchCompositions(s.query);
    }
    window._savedSearch = null;
  }
}

// ── File upload to Supabase Storage ──────────────────────────────────────────

function triggerUpload(inputId) {
  document.getElementById(inputId).click();
}

async function uploadFile(input, urlFieldId, bucket) {
  const file = input.files[0];
  if (!file) return;

  const progressId = urlFieldId.replace('Url', 'Progress');
  const progress = document.getElementById(progressId);
  if (progress) { progress.style.display = 'block'; progress.textContent = 'Laster opp…'; }

  try {
    // Use composition title + timestamp as filename to avoid collisions
    const ext      = file.name.split('.').pop();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path     = `${Date.now()}_${safeName}`;

    const r = await fetch(
      `https://tfqnzszyjsdgdeksizel.supabase.co/storage/v1/object/${bucket}/${path}`,
      {
        method: 'POST',
        headers: {
          'apikey':        KEY,
          'Authorization': `Bearer ${KEY}`,
          'Content-Type':  file.type || 'application/octet-stream',
        },
        body: file
      }
    );

    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Upload feilet (${r.status}): ${err}`);
    }

    const publicUrl = `https://tfqnzszyjsdgdeksizel.supabase.co/storage/v1/object/public/${bucket}/${path}`;
    document.getElementById(urlFieldId).value = publicUrl;
    if (progress) { progress.textContent = `✓ ${file.name} lastet opp`; }
  } catch(err) {
    if (progress) { progress.textContent = `Feil: ${err.message}`; }
    alert('Opplasting feilet: ' + err.message);
  }

  // Reset file input so same file can be re-uploaded if needed
  input.value = '';
}


// ── PERSON TAB ────────────────────────────────────────────────────────────────

function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '';
  const offset = 127397;
  return Array.from(code.toUpperCase()).map(c => String.fromCodePoint(c.charCodeAt(0) + offset)).join('');
}

document.getElementById('p_birth_country').addEventListener('input', function() {
  this.value = this.value.toUpperCase();
  const v = this.value.trim();
  document.getElementById('p_birth_flag').textContent = v ? countryCodeToFlag(v) : '';
  const natField = document.getElementById('p_nationality');
  if (v && !natField.value.trim()) {
    natField.value = v;
    document.getElementById('p_flag').textContent = countryCodeToFlag(v);
  }
});
document.getElementById('p_nationality').addEventListener('input', function() {
  this.value = this.value.toUpperCase();
  document.getElementById('p_flag').textContent = countryCodeToFlag(this.value);
});
document.getElementById('np_birth_country').addEventListener('input', function() {
  this.value = this.value.toUpperCase();
  const v = this.value.trim();
  document.getElementById('np_birth_flag').textContent = v ? countryCodeToFlag(v) : '';
  const natField = document.getElementById('np_nationality');
  if (v && !natField.value.trim()) {
    natField.value = v;
    document.getElementById('np_flag').textContent = countryCodeToFlag(v);
  }
});
document.getElementById('np_nationality').addEventListener('input', function() {
  this.value = this.value.toUpperCase();
  document.getElementById('np_flag').textContent = countryCodeToFlag(this.value);
});
document.getElementById('e_displayCountry').addEventListener('input', function() {
  this.value = this.value.toUpperCase();
  document.getElementById('e_displayCountryFlag').textContent = countryCodeToFlag(this.value);
});
document.getElementById('p_bioUrl').addEventListener('input', function() {
  const link = document.getElementById('p_bioLink');
  if (this.value.trim()) { link.href = this.value.trim(); link.style.display = 'block'; }
  else { link.style.display = 'none'; }
});

let personSearchTimeout, personSearchController;
document.getElementById('personSearch').addEventListener('input', () => {
  clearTimeout(personSearchTimeout);
  // Clear form when user starts typing a new search
  document.getElementById('personPanel').style.display = 'none';
  document.getElementById('personCompositions').innerHTML = '';
  const q = document.getElementById('personSearch').value.trim();
  if (q.length < 2) { document.getElementById('personSearchResults').innerHTML = ''; return; }
  personSearchTimeout = setTimeout(async () => {
    personSearchController?.abort();
    personSearchController = new AbortController();
    let rows;
    try {
      rows = await get(`/person?last_name=ilike.${encodeURIComponent(q)}*&select=person_id,first_name,last_name,born,died,nationality,gender&limit=20&order=last_name`, personSearchController.signal);
    } catch (err) {
      if (err.name === 'AbortError') return;
      throw err;
    }
    const container = document.getElementById('personSearchResults');
    container.innerHTML = '';
    if (!rows.length) { container.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:.5rem 0">Ingen treff.</div>'; return; }
    rows.forEach(p => {
      const d = document.createElement('div');
      d.className = 'result-row';
      const flag = countryCodeToFlag(p.nationality || '');
      const years = p.born ? `${p.born}${p.died ? ' – ' + p.died : ''}` : '';
      const femBadge = p.gender === 'F' ? ' <span title="Kvinnelig komponist" style="color:var(--accent);font-size:0.8rem;font-weight:600">♀</span>' : '';
      d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;cursor:pointer';
      d.onclick = () => loadPersonForm(p.person_id);
      const personLeft = document.createElement('div');
      personLeft.innerHTML = `<div class="result-title">${flag} ${escapeHtml(p.first_name || '')} ${escapeHtml(p.last_name)}${femBadge}</div>
                     <div class="result-meta">${escapeHtml(years)}</div>`;
      const scoreBtn = document.createElement('button');
      scoreBtn.type = 'button';
      scoreBtn.title = 'Vis komposisjoner';
      scoreBtn.textContent = '🎵';
      scoreBtn.style.cssText = 'background:none;border:1px solid var(--border);border-radius:4px;padding:0.1rem 0.4rem;cursor:pointer;font-size:0.9rem;flex-shrink:0';
      scoreBtn.onclick = (e) => { e.stopPropagation(); openComposerScores(p.person_id, [p.first_name, p.last_name].filter(Boolean).join(' ')); };
      d.appendChild(personLeft);
      d.appendChild(scoreBtn);
      container.appendChild(d);
    });
  }, 250);
});

async function loadPersonForm(personId) {
  const rows = await get(`/person?person_id=eq.${personId}&select=*`);
  const p = rows[0];
  document.getElementById('p_personId').value   = p.person_id;
  document.getElementById('p_firstName').value  = p.first_name || '';
  document.getElementById('p_lastName').value   = p.last_name  || '';
  // Store original name so we can detect changes on save
  document.getElementById('p_firstName').dataset.original = p.first_name || '';
  document.getElementById('p_lastName').dataset.original  = p.last_name  || '';
  document.getElementById('p_born').value             = p.born       || '';
  document.getElementById('p_born_uncertain').checked = (p.born_uncertain === 'yes' || p.born_uncertain === true);
  document.getElementById('p_died').value             = p.died       || '';
  document.getElementById('p_died_uncertain').checked = (p.died_uncertain === 'yes' || p.died_uncertain === true);
  document.getElementById('p_nationality').value     = p.nationality   || '';
  document.getElementById('p_birth_country').value          = p.birth_country || '';
  document.getElementById('p_birth_country_primary').checked = (p.birth_country_primary === true);
  document.getElementById('p_pseudonym').value       = p.pseudonym     || '';
  document.getElementById('p_gender').value          = p.gender        || '';
  document.getElementById('p_bioUrl').value          = p.bio_url       || '';
  document.getElementById('p_bioUrlVerified').checked = (p.bio_url_verified === true);
  document.getElementById('p_bioText').value         = p.bio_text      || '';
  document.getElementById('p_bioSource').value        = p.bio_source    || '';
  document.getElementById('p_photoUrl').value        = p.photo_url     || '';
  updatePersonPhotoPreview();
  document.getElementById('p_flag').textContent      = countryCodeToFlag(p.nationality || '');
  document.getElementById('p_birth_flag').textContent = (p.birth_country && p.birth_country !== p.nationality)
    ? countryCodeToFlag(p.birth_country) : '';
  const link = document.getElementById('p_bioLink');
  if (p.bio_url) { link.href = p.bio_url; link.style.display = 'block'; }
  else link.style.display = 'none';
  document.getElementById('personPanel').style.display = 'block';
  document.getElementById('newPersonCard').style.display = 'none';
  document.getElementById('personSearchResults').innerHTML = '';
  document.getElementById('personSearch').value = '';
  document.getElementById('personCompositions').innerHTML = '';

  // Fetch composition count and set delete button state
  const deleteBtn   = document.getElementById('deletePersonBtn');
  const countSpan   = document.getElementById('p_compositionCount');
  deleteBtn.disabled = true;
  deleteBtn.title    = 'Laster…';
  countSpan.textContent = '';
  try {
    const cc = await get(`/composition_person?person_id=eq.${p.person_id}&select=composition_id`);
    const count = cc.length;
    if (count === 0) {
      deleteBtn.disabled = false;
      deleteBtn.title    = 'Slett denne personen';
      countSpan.textContent = 'Ingen komposisjoner — kan slettes';
      countSpan.style.color = 'var(--muted)';
    } else {
      deleteBtn.disabled = true;
      deleteBtn.title    = `Kan ikke slettes — bidrar til ${count} komposisjon${count !== 1 ? 'er' : ''}`;
      countSpan.textContent = `${count} komposisjon${count !== 1 ? 'er' : ''} — kan ikke slettes`;
      countSpan.style.color = 'var(--muted)';
    }
  } catch(e) {
    deleteBtn.disabled = true;
    countSpan.textContent = '';
  }
}

async function savePerson() {
  const personId  = document.getElementById('p_personId').value;
  const first     = document.getElementById('p_firstName').value.trim();
  const last      = document.getElementById('p_lastName').value.trim();
  const origFirst = document.getElementById('p_firstName').dataset.original || '';
  const origLast  = document.getElementById('p_lastName').dataset.original  || '';
  if (!last) { alert('Etternavn er påkrevd.'); return; }

  // Check if name has changed
  const nameChanged = first !== origFirst || last !== origLast;

  if (nameChanged) {
    // Check if new name already exists in database
    const existing = await get(`/person?last_name=ilike.${encodeURIComponent(last)}&select=person_id,first_name,last_name,pseudonym`);
    const match = existing.find(p =>
      parseInt(p.person_id) !== parseInt(personId) && (
        (!first && !p.first_name) ||
        (first && p.first_name && p.first_name.toLowerCase() === first.toLowerCase())
      )
    );

    if (match) {
      const targetName  = ((match.first_name || '') + ' ' + match.last_name).trim();
      const currentName = (origFirst ? origFirst + ' ' : '') + origLast;
      const choice = confirm(
        `"${targetName}" finnes allerede i databasen (ID ${match.person_id}).

` +
        `Vil du SLÅ SAMMEN disse to personene?

` +
        `OK = Slå sammen: flytt alle komposisjoner/tekster til "${targetName}", ` +
        `legg til "${currentName}" som pseudonym, og slett denne posten.

` +
        `Avbryt = Lagre bare navneendringen uten sammenslåing`
      );

      if (choice) {
        showMsg('personMsg', 'Slår sammen…', '');
        try {
          // Move composition_person links
          const cp = await get(`/composition_person?person_id=eq.${personId}&select=id,composition_id,role,credited_as`);
          for (const row of cp) {
            const exists = await get(`/composition_person?person_id=eq.${match.person_id}&composition_id=eq.${row.composition_id}&role=eq.${row.role}&select=id`);
            if (!exists.length) {
              await post('composition_person', { composition_id: row.composition_id, person_id: match.person_id, role: row.role, credited_as: row.credited_as||null });
            }
          }
          await del('composition_person', `person_id=eq.${personId}`);

          // Add old name as pseudonym on target
          const newPseudo = match.pseudonym
            ? match.pseudonym + ', ' + currentName
            : currentName;
          await patch('person', `person_id=eq.${match.person_id}`, { pseudonym: newPseudo });

          // Delete the current (now empty) record
          await del('person', `person_id=eq.${personId}`);

          showMsg('personMsg', `✓ Slått sammen med "${targetName}" (ID ${match.person_id}). "${currentName}" lagt til som pseudonym.`, 'success');
          closePerson();
        } catch(err) {
          showMsg('personMsg', 'Feil under sammenslåing: ' + err.message, 'error');
        }
        return;
      }
    }
  }

  // Normal save
  try {
    const gender      = document.getElementById('p_gender').value;
    const nationality    = document.getElementById('p_nationality').value.trim() || null;
    const birth_country         = document.getElementById('p_birth_country').value.trim() || null;
    const birth_country_primary = document.getElementById('p_birth_country_primary').checked;
    await patch('person', `person_id=eq.${personId}`, {
      first_name:           first || null,
      last_name:            last,
      born:                 parseInt(document.getElementById('p_born').value) || null,
      born_uncertain:       document.getElementById('p_born_uncertain').checked,
      died:                 parseInt(document.getElementById('p_died').value) || null,
      died_uncertain:       document.getElementById('p_died_uncertain').checked,
      nationality,
      birth_country,
      birth_country_primary,
      pseudonym:            document.getElementById('p_pseudonym').value.trim() || null,
      gender:               gender || null,
      bio_url:              document.getElementById('p_bioUrl').value.trim() || null,
      bio_url_verified:     document.getElementById('p_bioUrlVerified').checked,
      bio_text:             document.getElementById('p_bioText').value.trim() || null,
      bio_source:           document.getElementById('p_bioSource').value.trim() || null,
      photo_url:            document.getElementById('p_photoUrl').value.trim() || null,
    });
    showMsg('personMsg', '✓ Person oppdatert', 'success');
    closePerson();
  } catch(err) {
    showMsg('personMsg', 'Feil: ' + err.message, 'error');
  }
}

async function loadPersonCompositions(personId) {
  const container = document.getElementById('personCompositions');
  container.innerHTML = '<div style="color:var(--muted);font-size:.85rem">Laster komposisjoner…</div>';
  const cc = await get(`/composition_person?person_id=eq.${personId}&select=composition_id,role&limit=200`);
  if (!cc.length) { container.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:0.5rem 0">Ingen komposisjoner funnet.</div>'; return; }
  const ids = cc.map(r => r.composition_id).join(',');
  const roleMap = Object.fromEntries(cc.map(r => [r.composition_id, r.role]));
  const comps = (await get(`/composition?composition_id=in.(${ids})&select=composition_id,title,year_composed,public_domain,musescore_link`))
    .map(c => ({ ...c, role: roleMap[c.composition_id] }))
    .sort((a,b) => (a.title||'').localeCompare(b.title||''));
  if (!comps.length) { container.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:0.5rem 0">Ingen komposisjoner funnet.</div>'; return; }
  container.innerHTML = `
    <div class="card">
      <div class="card-title">Komposisjoner (${comps.length})</div>
      <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
        <tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left;padding:0.3rem 0.5rem">Tittel</th>
          <th style="text-align:left;padding:0.3rem">Rolle</th>
          <th style="text-align:center;padding:0.3rem">År</th>
          <th style="text-align:center;padding:0.3rem">PD</th>
          <th style="text-align:center;padding:0.3rem">MS</th>
          <th style="text-align:center;padding:0.3rem">Rediger</th>
        </tr>
        ${comps.map(c => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:0.3rem 0.5rem">${escapeHtml(c.title)}</td>
          <td style="padding:0.3rem;color:var(--muted);font-size:0.78rem">${escapeHtml(ROLE_NO[c.role]||c.role||'')}</td>
          <td style="text-align:center;color:var(--muted);padding:0.3rem">${escapeHtml(c.year_composed||'—')}</td>
          <td style="text-align:center;padding:0.3rem">${c.public_domain==='Yes'?'✓':''}</td>
          <td style="text-align:center;padding:0.3rem">${c.musescore_link?`<a href="${escapeHtml(c.musescore_link)}" target="_blank" rel="noopener noreferrer">🔗</a>`:''}</td>
          <td style="text-align:center;padding:0.3rem"><button type="button" onclick="switchTab('edit');loadEditForm(${c.composition_id})" style="background:none;border:1px solid var(--border);border-radius:3px;padding:0.1rem 0.4rem;cursor:pointer;font-size:0.8rem">✏️</button></td>
        </tr>`).join('')}
      </table>
    </div>`;
}

function closePerson() {
  document.getElementById('personPanel').style.display = 'none';
  document.getElementById('newPersonCard').style.display = 'block';
}

async function deletePerson() {
  const personId = document.getElementById('p_personId').value;
  const first    = document.getElementById('p_firstName').value.trim();
  const last     = document.getElementById('p_lastName').value.trim();
  const name     = [first, last].filter(Boolean).join(' ');
  if (!confirm(`Slette "${name}"? Dette kan ikke angres.`)) return;
  try {
    await del('person', `person_id=eq.${personId}`);
    showMsg('personMsg', `✓ "${name}" er slettet.`, 'success');
    closePerson();
  } catch(err) {
    showMsg('personMsg', 'Feil: ' + err.message, 'error');
  }
}


// ── New person form reset ─────────────────────────────────────────────────────
function resetNewPersonForm() {
  ['np_firstName','np_lastName','np_born','np_died','np_nationality','np_birth_country','np_bioUrl'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('np_birth_country_primary').checked = false;
  document.getElementById('np_gender').value = '';
  document.getElementById('np_bioUrlVerified').checked = false;
  document.getElementById('np_bioLink').style.display = 'none';
  document.getElementById('np_flag').textContent = '';
  document.getElementById('np_birth_flag').textContent = '';
}

// ── Person duplicate helpers (called from inline warning buttons) ─────────────
async function addAsPseudonym(matchId, fullName, yrs, btn) {
  const last  = document.getElementById('np_lastName').value.trim();
  const first = document.getElementById('np_firstName').value.trim();
  const newPseudo = first ? `${first} ${last}` : last;
  // Fetch current pseudonym value
  const rows = await get(`/person?person_id=eq.${matchId}&select=pseudonym`);
  const curPseudo = rows[0]?.pseudonym || '';
  const updatedPseudo = curPseudo ? curPseudo + ', ' + newPseudo : newPseudo;
  await patch('person', `person_id=eq.${matchId}`, { pseudonym: updatedPseudo });
  showMsg('personMsg', `✓ "${newPseudo}" lagt til som pseudonym på ${fullName} (ID ${matchId})`, 'success');
  resetNewPersonForm();
}

async function forceAddPerson(btn) {
  btn.disabled = true; btn.textContent = 'Lagrer…';
  const last  = document.getElementById('np_lastName').value.trim();
  const first = document.getElementById('np_firstName').value.trim();
  const gender      = document.getElementById('np_gender').value;
  const nationality   = document.getElementById('np_nationality').value.trim() || null;
  const birth_country         = document.getElementById('np_birth_country').value.trim() || null;
  const birth_country_primary = document.getElementById('np_birth_country_primary').checked;
  try {
    const p = await post('person', {
      first_name:       first || null,
      last_name:        last,
      born:             parseInt(document.getElementById('np_born').value) || null,
      died:             parseInt(document.getElementById('np_died').value) || null,
      nationality,
      birth_country,
      birth_country_primary,
      gender:           gender || null,
      bio_url:          document.getElementById('np_bioUrl').value.trim() || null,
      bio_url_verified: document.getElementById('np_bioUrlVerified').checked || false,
    });
    showMsg('personMsg', `✓ ${first} ${last} lagt til som ny person (id=${p.person_id})`, 'success');
    resetNewPersonForm();
  } catch(err) {
    showMsg('personMsg', 'Feil: ' + err.message, 'error');
  }
}

async function addNewPerson() {
  const last  = document.getElementById('np_lastName').value.trim();
  const first = document.getElementById('np_firstName').value.trim();
  if (!last) { alert('Etternavn er påkrevd.'); return; }
  const existing = await get(`/person?last_name=ilike.${encodeURIComponent(last)}&select=person_id,first_name,last_name,born,died,pseudonym`);
  const match = existing.find(p => personNameOverlap(first, last, p));
  if (match) {
    const fullName = ((match.first_name || '') + ' ' + match.last_name).trim();
    const yrs = match.born ? ` (${match.born}${match.died ? '–'+match.died : ''})` : '';
    // Store match for use by the inline action buttons
    window._personDupMatch = { person_id: match.person_id, fullName, yrs, pseudonym: match.pseudonym };
    const msgEl = document.getElementById('personMsg');
    msgEl.innerHTML = `<div style="background:#fff8e8;border:1px solid #e8c84a;border-radius:4px;padding:0.6rem 0.85rem;font-size:0.85rem;color:#5a4a00">
      <div style="font-weight:600;margin-bottom:0.35rem">&#9888; Person finnes allerede: ${escapeHtml(fullName)}${escapeHtml(yrs)} [ID ${match.person_id}]</div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.4rem">
        <button onclick="addAsPseudonymFromMatch()" class="btn btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.6rem">Legg til som pseudonym</button>
        <button onclick="forceAddPerson(this)" class="btn" style="font-size:0.8rem;padding:0.25rem 0.6rem;background:#c8a000;color:#fff;border:none;border-radius:4px;cursor:pointer">Opprett likevel som ny person</button>
      </div>
    </div>`;
    msgEl.className = 'msg';
    return;
  }
  try {
    const gender      = document.getElementById('np_gender').value;
    const nationality   = document.getElementById('np_nationality').value.trim() || null;
    const birth_country         = document.getElementById('np_birth_country').value.trim() || null;
    const birth_country_primary = document.getElementById('np_birth_country_primary').checked;
    const p = await post('person', {
      first_name:          document.getElementById('np_firstName').value.trim() || null,
      last_name:           last,
      born:                parseInt(document.getElementById('np_born').value) || null,
      died:                parseInt(document.getElementById('np_died').value) || null,
      nationality,
      birth_country,
      gender:              gender || null,
      bio_url:             document.getElementById('np_bioUrl').value.trim() || null,
      bio_url_verified:    document.getElementById('np_bioUrlVerified').checked || false,
    });
    showMsg('personMsg', `✓ ${document.getElementById('np_firstName').value} ${last} lagt til (id=${p.person_id})`, 'success');
    resetNewPersonForm();
  } catch(err) {
    showMsg('personMsg', 'Feil: ' + err.message, 'error');
  }
}


// ═══════════════════════ TAGS ═══════════════════════
let _allTags = null;
async function getAllTags() {
  if (_allTags) return _allTags;
  _allTags = await get('/tag?select=tag_id,tag_name&order=tag_name.asc');
  return _allTags;
}

async function createNewTag() {
  const input = document.getElementById('e_newTagInput');
  const tagName = (input?.value || '').trim();
  if (!tagName) { alert('Skriv inn et tagnavn først.'); return; }

  // Check for duplicate (case-insensitive)
  const existing = await getAllTags();
  const dup = existing.find(t => t.tag_name.toLowerCase() === tagName.toLowerCase());
  if (dup) {
    alert(`Taggen "${dup.tag_name}" finnes allerede.`);
    return;
  }

  try {
    const res = await fetch(`${SB}/tag`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ tag_name: tagName })
    });
    if (!res.ok) throw new Error(await res.text());
    const [newTag] = await res.json();

    // Reset cache so checkboxes reload with new tag
    _allTags = null;

    // Reload checkboxes with current composition and auto-check the new tag
    const compId = document.getElementById('e_compId')?.value;
    if (compId) {
      await loadTagCheckboxes(parseInt(compId));
      // Auto-check the newly created tag
      const cb = [...document.querySelectorAll('#e_tagCheckboxes input[type=checkbox]')]
        .find(c => c.value == newTag.tag_id);
      if (cb) { cb.checked = true; updateTagDropdownLabel(); }
    }

    input.value = '';
  } catch(e) {
    alert('Feil ved oppretting av tagg: ' + e.message);
  }
}
async function loadTagCheckboxes(compId) {
  const container = document.getElementById('e_tagCheckboxes');
  if (!container) return;
  const [allTags, compTags] = await Promise.all([
    getAllTags(),
    get(`/composition_tag?composition_id=eq.${compId}&select=tag_id`)
  ]);
  const assigned = new Set(compTags.map(t => t.tag_id));
  container.innerHTML = allTags.map(t => `
    <label style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.15rem 0.5rem;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:0.72rem;letter-spacing:0.03em;background:${assigned.has(t.tag_id) ? 'var(--accent)' : 'white'};color:${assigned.has(t.tag_id) ? 'white' : 'var(--muted)'};transition:background 0.15s" onclick="toggleTagLabel(this,event)">
      <input type="checkbox" value="${t.tag_id}" ${assigned.has(t.tag_id) ? 'checked' : ''} style="display:none">
      ${t.tag_name}
    </label>`).join('');
  updateTagDropdownLabel();
}
function toggleTagLabel(label, event) {
  // The label onclick fires before the browser processes the click-on-label
  // checkbox toggle, so we handle it manually and stop the default behaviour.
  if (event) event.preventDefault();
  const cb = label.querySelector('input');
  cb.checked = !cb.checked;
  label.style.background = cb.checked ? 'var(--accent)' : 'white';
  label.style.color      = cb.checked ? 'white' : 'var(--muted)';
  updateTagDropdownLabel();
}

function toggleTagDropdown() {
  const dd  = document.getElementById('e_tagCheckboxes');
  const btn = document.getElementById('e_tagDropdownBtn');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.querySelector('span:last-child').textContent = isOpen ? '▼' : '▲';
  if (!isOpen) setTimeout(() => document.addEventListener('click', closeTagDropdownOutside), 0);
}

function closeTagDropdownOutside(e) {
  const wrapper = document.getElementById('e_tagDropdown');
  if (wrapper && !wrapper.contains(e.target)) {
    const dd  = document.getElementById('e_tagCheckboxes');
    const btn = document.getElementById('e_tagDropdownBtn');
    if (dd)  dd.style.display = 'none';
    if (btn) btn.querySelector('span:last-child').textContent = '▼';
    document.removeEventListener('click', closeTagDropdownOutside);
  }
}

function updateTagDropdownLabel() {
  const checked = [...document.querySelectorAll('#e_tagCheckboxes input[type=checkbox]:checked')];
  const lbl = document.getElementById('e_tagDropdownLabel');
  if (!lbl) return;
  if (checked.length === 0) {
    lbl.textContent = 'Ingen tagger valgt';
    lbl.style.color = 'var(--muted)';
  } else {
    lbl.textContent = checked.map(cb => cb.closest('label').textContent.trim()).join(', ');
    lbl.style.color = 'var(--ink)';
  }
}

// ═══════════════════════ BIO-LENKER ═══════════════════════
let bioPersons  = [];
let bioIndex    = 0;
let bioMode     = 'unverified';
let bioVerified = 0;
let bioNulled   = 0;
let bioSaved    = 0;

async function loadBioPersons() {
  if (bioLoaded) return;
  bioLoaded = true;
  let unverified = [], offset = 0;
  while (true) {
    const r = await get(`/person?bio_url=not.is.null&bio_url_verified=eq.false&select=person_id,first_name,last_name,born,died,nationality,bio_url&order=last_name.asc&offset=${offset}`);
    unverified = unverified.concat(r); if (r.length < 1000) break; offset += 1000;
  }
  let missing = [], offset2 = 0;
  while (true) {
    const r = await get(`/person?bio_url=is.null&select=person_id,first_name,last_name,born,died,nationality&order=last_name.asc&offset=${offset2}`);
    missing = missing.concat(r); if (r.length < 1000) break; offset2 += 1000;
  }
  document.getElementById('countUnverified').textContent = unverified.length;
  document.getElementById('countMissing').textContent    = missing.length;
  window._bioUnverified = unverified;
  window._bioMissing    = missing;
  showBioSection(bioMode);
}

function showBioSection(mode) {
  bioMode    = mode;
  bioPersons = mode === 'unverified' ? (window._bioUnverified || []) : (window._bioMissing || []);
  document.getElementById('bioTabUnverified').style.borderColor = mode === 'unverified' ? 'var(--accent)' : '';
  document.getElementById('bioTabMissing').style.borderColor    = mode === 'missing'    ? 'var(--accent)' : '';
  renderBioList();
}

function renderBioList() {
  const area = document.getElementById('bioCardArea');
  const nav  = document.getElementById('bioAlphaNav');
  if (!bioPersons.length) {
    nav.innerHTML = '';
    area.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--accent2);font-family:\'Playfair Display\',serif;font-size:1.2rem">✓ Ingen å behandle</div>';
    return;
  }

  // Group by first letter of last_name
  const groups = {};
  for (const p of bioPersons) {
    const letter = (p.last_name || '?')[0].toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(p);
  }
  const letters = Object.keys(groups).sort((a,b) => a.localeCompare(b, 'nb'));

  // Alpha nav
  nav.innerHTML = letters.map(l =>
    `<a href="#bio-letter-${l}" style="display:inline-block;width:2rem;height:2rem;line-height:2rem;text-align:center;border:1px solid var(--border);border-radius:3px;font-size:0.85rem;font-weight:500;color:var(--ink);text-decoration:none;background:var(--paper)">${l}</a>`
  ).join('');

  // List
  area.innerHTML = letters.map(letter => {
    const persons = groups[letter];
    const rows = persons.map(p => {
      const name = ((p.first_name||'') + ' ' + (p.last_name||'')).trim() || '⚠ Navn mangler';
      const meta = [p.born && p.died ? `${p.born}–${p.died}` : (p.born||p.died||''), p.nationality||''].filter(Boolean).join(' · ');
      const extra = bioMode === 'unverified'
        ? `<span style="font-size:0.75rem;color:var(--muted);font-family:monospace;word-break:break-all">${p.bio_url}</span>`
        : '';
      return `<div style="padding:0.6rem 0;border-bottom:1px solid var(--warm);display:flex;align-items:flex-start;gap:0.75rem;cursor:pointer" onclick="biOpenPanel(${p.person_id})" id="bio-person-${p.person_id}">
        <div style="flex:1">
          <span style="font-weight:500">${name}</span>
          <span style="font-size:0.82rem;color:var(--muted);margin-left:0.5rem">${meta}</span>
          <div>${extra}</div>
        </div>
        <span style="font-size:0.78rem;color:var(--accent);white-space:nowrap;padding-top:0.2rem">Rediger →</span>
      </div>`;
    }).join('');
    return `<div class="card" id="bio-letter-${letter}" style="margin-bottom:1rem">
      <div style="font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:600;color:var(--accent);border-bottom:1px solid var(--border);padding-bottom:0.4rem;margin-bottom:0.2rem">${letter}</div>
      ${rows}
    </div>`;
  }).join('');
}

function biOpenPanel(pid) {
  // Close any open panel first
  const existing = document.getElementById('bio-panel');
  if (existing) existing.remove();

  const p = bioPersons.find(x => x.person_id === pid);
  if (!p) return;
  const name = ((p.first_name||'') + ' ' + (p.last_name||'')).trim() || '⚠ Navn mangler';
  const meta = `ID: ${p.person_id}` + ([p.born,p.died].filter(Boolean).join('–') ? ' · ' + [p.born,p.died].filter(Boolean).join('–') : '') + (p.nationality ? ' · ' + p.nationality : '');
  const enc  = encodeURIComponent(name);

  let panelHtml = '';
  if (bioMode === 'unverified') {
    panelHtml = `
      <div style="background:var(--paper);border:1px solid var(--border);border-radius:5px;padding:0.6rem 0.9rem;font-size:0.82rem;word-break:break-all;margin-bottom:1rem;font-family:monospace">${escapeHtml(p.bio_url)}</div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        <a class="btn btn-secondary" href="${escapeHtml(p.bio_url)}" target="_blank" rel="noopener noreferrer" style="font-size:0.85rem">🔗 Åpne lenke</a>
        <button type="button" class="btn btn-primary" id="btnBioVerify" onclick="biDoVerify(${p.person_id})" style="font-size:0.85rem">✓ Verifiser</button>
        <button type="button" class="btn btn-secondary" onclick="biDoNull(${p.person_id})" style="font-size:0.85rem;color:var(--accent);border-color:var(--accent)">✗ Fjern lenke</button>
        <button type="button" class="btn btn-secondary" onclick="biToggleScores(${p.person_id}, this)" style="font-size:0.85rem">♪ Vis komposisjoner</button>
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('bio-panel').remove()" style="font-size:0.85rem">✕ Lukk</button>
      </div>`;
  } else {
    panelHtml = `
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem">
        <a style="font-size:0.78rem;padding:3px 10px;border:1px solid var(--border);border-radius:4px;color:var(--muted);text-decoration:none;background:var(--paper)" href="https://no.wikipedia.org/w/index.php?search=${enc}" target="_blank">no.wikipedia</a>
        <a style="font-size:0.78rem;padding:3px 10px;border:1px solid var(--border);border-radius:4px;color:var(--muted);text-decoration:none;background:var(--paper)" href="https://sv.wikipedia.org/w/index.php?search=${enc}" target="_blank">sv.wikipedia</a>
        <a style="font-size:0.78rem;padding:3px 10px;border:1px solid var(--border);border-radius:4px;color:var(--muted);text-decoration:none;background:var(--paper)" href="https://en.wikipedia.org/w/index.php?search=${enc}" target="_blank">en.wikipedia</a>
        <a style="font-size:0.78rem;padding:3px 10px;border:1px solid var(--border);border-radius:4px;color:var(--muted);text-decoration:none;background:var(--paper)" href="https://da.wikipedia.org/w/index.php?search=${enc}" target="_blank">da.wikipedia</a>
        <a style="font-size:0.78rem;padding:3px 10px;border:1px solid var(--border);border-radius:4px;color:var(--muted);text-decoration:none;background:var(--paper)" href="https://snl.no/search?query=${enc}" target="_blank">snl.no</a>
        <a style="font-size:0.78rem;padding:3px 10px;border:1px solid var(--border);border-radius:4px;color:var(--muted);text-decoration:none;background:var(--paper)" href="https://nbl.snl.no/search?query=${enc}" target="_blank">nbl.snl.no</a>
        <a style="font-size:0.78rem;padding:3px 10px;border:1px solid var(--border);border-radius:4px;color:var(--muted);text-decoration:none;background:var(--paper)" href="https://www.nb.no/search?q=${enc}" target="_blank">nb.no</a>
      </div>
      <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
        <input id="bioUrlInput" type="url" placeholder="Lim inn bio-lenke her…" style="flex:1;padding:0.55rem 0.8rem;border:1px solid var(--border);border-radius:5px;font-family:inherit;font-size:0.88rem">
        <a id="btnBioTest" class="btn btn-secondary" href="#" target="_blank" style="font-size:0.85rem">Åpne</a>
      </div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        <button type="button" class="btn btn-primary" id="btnBioSave" onclick="biDoSave(${p.person_id})" style="font-size:0.85rem">💾 Lagre lenke</button>
        <button type="button" class="btn btn-secondary" onclick="biToggleScores(${p.person_id}, this)" style="font-size:0.85rem">♪ Vis komposisjoner</button>
        <button type="button" class="btn btn-secondary" onclick="document.getElementById('bio-panel').remove()" style="font-size:0.85rem">✕ Lukk</button>
      </div>`;
  }

  const panel = document.createElement('div');
  panel.id = 'bio-panel';
  panel.className = 'card';
  panel.style.cssText = 'position:sticky;top:1rem;z-index:10;border:2px solid var(--accent);margin-bottom:1.5rem';
  panel.innerHTML = `
    <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:600;margin-bottom:0.2rem">
      <a href="#" onclick="switchTab('person');loadPersonForm(${p.person_id});return false;" style="color:inherit;text-decoration:none;border-bottom:1px solid var(--border)">${escapeHtml(name)}</a>
    </div>
    <div style="font-size:0.85rem;color:var(--muted);margin-bottom:1rem">${escapeHtml(meta)}</div>
    ${panelHtml}
    <div id="bioMsg" style="font-size:0.82rem;margin-top:0.5rem;color:var(--muted);min-height:1.2em"></div>
    <div id="bioScores" style="display:none;margin-top:0.75rem;border-top:1px solid var(--border);padding-top:0.75rem;font-size:0.85rem"></div>`;

  const personRow = document.getElementById(`bio-person-${pid}`);
  personRow.insertAdjacentElement('afterend', panel);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  if (bioMode === 'missing') {
    document.getElementById('bioUrlInput').addEventListener('input', () => {
      document.getElementById('btnBioTest').href = document.getElementById('bioUrlInput').value.trim() || '#';
    });
  }
}

async function biDoVerify(pid) {
  document.getElementById('btnBioVerify').disabled = true;
  document.getElementById('bioMsg').textContent = 'Lagrer…';
  try {
    await patch('person', `person_id=eq.${pid}`, { bio_url_verified: true });
    bioVerified++;
    window._bioUnverified = window._bioUnverified.filter(p => p.person_id !== pid);
    bioPersons = window._bioUnverified;
    document.getElementById('countUnverified').textContent = bioPersons.length;
    document.getElementById('bio-panel')?.remove();
    document.getElementById(`bio-person-${pid}`)?.remove();
  } catch(e) { document.getElementById('bioMsg').textContent = 'Feil — prøv igjen'; }
}

async function biDoNull(pid) {
  document.getElementById('bioMsg').textContent = 'Fjerner…';
  try {
    await patch('person', `person_id=eq.${pid}`, { bio_url: null, bio_url_verified: false });
    bioNulled++;
    window._bioUnverified = window._bioUnverified.filter(p => p.person_id !== pid);
    bioPersons = window._bioUnverified;
    document.getElementById('countUnverified').textContent = bioPersons.length;
    document.getElementById('bio-panel')?.remove();
    document.getElementById(`bio-person-${pid}`)?.remove();
  } catch(e) { document.getElementById('bioMsg').textContent = 'Feil — prøv igjen'; }
}

async function biDoSave(pid) {
  const url = document.getElementById('bioUrlInput')?.value.trim();
  if (!url) { document.getElementById('bioMsg').textContent = 'Skriv inn en lenke først'; return; }
  document.getElementById('btnBioSave').disabled = true;
  document.getElementById('bioMsg').textContent = 'Lagrer…';
  try {
    await patch('person', `person_id=eq.${pid}`, { bio_url: url, bio_url_verified: true });
    bioSaved++;
    window._bioMissing = window._bioMissing.filter(p => p.person_id !== pid);
    bioPersons = window._bioMissing;
    document.getElementById('countMissing').textContent = bioPersons.length;
    document.getElementById('bio-panel')?.remove();
    document.getElementById(`bio-person-${pid}`)?.remove();
  } catch(e) { document.getElementById('bioMsg').textContent = 'Feil — prøv igjen'; }
}


async function biToggleScores(pid, btn) {
  const scoresDiv = document.getElementById('bioScores');
  if (!scoresDiv) return;

  if (scoresDiv.style.display !== 'none') {
    scoresDiv.style.display = 'none';
    btn.textContent = '♪ Vis komposisjoner';
    return;
  }

  btn.textContent = 'Laster…';
  btn.disabled = true;

  try {
    // Fetch person to get pseudonyms
    const persons = await get(`/person?person_id=eq.${pid}&select=person_id,first_name,last_name,pseudonym`);
    const person  = persons[0];
    const pseudonyms = (person?.pseudonym || '').split(',').map(s => s.trim()).filter(Boolean);

    // Fetch all person_ids to check (this person + any that have this person's name as pseudonym)
    // Also find persons whose last_name matches any pseudonym
    const allPids = new Set([pid]);

    // Fetch all compositions for this person regardless of role
    const cc = await get(`/composition_person?person_id=eq.${pid}&select=composition_id,role`);
    const compIds = [...new Set(cc.map(r => r.composition_id))];

    if (compIds.length === 0) {
      scoresDiv.innerHTML = '<em style="color:var(--muted)">Ingen komposisjoner funnet</em>';
      scoresDiv.style.display = 'block';
      btn.textContent = '♪ Skjul';
      btn.disabled = false;
      return;
    }

    const comps = await get(`/composition?composition_id=in.(${compIds.join(',')})&select=composition_id,title,year_composed&order=title.asc`);

    // Build role map
    const roleMap = {};
    cc.forEach(r => {
      if (!roleMap[r.composition_id]) roleMap[r.composition_id] = [];
      roleMap[r.composition_id].push(ROLE_NO[r.role] || r.role);
    });

    scoresDiv.innerHTML = `
      <div style="font-weight:600;margin-bottom:0.5rem;color:var(--muted);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em">${comps.length} komposisjon${comps.length !== 1 ? 'er' : ''}</div>
      ${comps.map(comp => `
        <div style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid var(--faint)">
          <a href="#" onclick="switchTab('edit');loadEditForm(${comp.composition_id});return false;" style="color:var(--accent);text-decoration:none">${escapeHtml(comp.title)}</a>${comp.year_composed ? ` <span style="color:var(--muted)">(${escapeHtml(comp.year_composed)})</span>` : ''}
          <span style="color:var(--muted);font-size:0.78rem;margin-left:1rem;white-space:nowrap">${escapeHtml((roleMap[comp.composition_id] || []).join(', '))}</span>
        </div>`).join('')}
    `;
    scoresDiv.style.display = 'block';
    btn.textContent = '♪ Skjul';
  } catch(e) {
    scoresDiv.innerHTML = `<em style="color:var(--accent)">Feil: ${escapeHtml(e.message)}</em>`;
    scoresDiv.style.display = 'block';
    btn.textContent = '♪ Vis komposisjoner';
  }
  btn.disabled = false;
}

// ── Clearable fields ──────────────────────────────────────────────────────────

function makeClearable(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isTextarea = el.tagName === 'TEXTAREA';

  const wrap = document.createElement('div');
  wrap.className = 'input-clear-wrap ' + (isTextarea ? 'is-textarea' : 'is-input');

  el.parentNode.insertBefore(wrap, el);
  wrap.appendChild(el);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'input-clear-btn';
  btn.textContent = '×';
  btn.title = 'Tøm feltet';
  btn.addEventListener('click', () => {
    el.value = '';
    el.classList.remove('has-value');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  });
  wrap.appendChild(btn);

  // Keep has-value class in sync (needed for inputs loaded programmatically)
  el.addEventListener('input', () => {
    el.classList.toggle('has-value', el.value.length > 0);
  });
}

// New-entry form
['n_title','n_year','n_opus','n_notes','n_msLink','n_dedication',
 'n_publisherSearch','n_yearPublished','n_plateNumber','n_source','n_pdfUrl','n_mp3Url'].forEach(makeClearable);

// Edit form
['e_title','e_year','e_opus','e_msLink','e_notes','e_dedication',
 'e_msNotes','e_displayCountry',
 'e_publisherSearch','e_yearPublished','e_plateNumber','e_source','e_pdfUrl','e_mp3Url'].forEach(makeClearable);

// ── Supabase Storage upload ───────────────────────────────────────────────────

const PDF_BUCKET = 'scores-pdf';
const MP3_BUCKET = 'scores-mp3';

async function uploadScoreFile(input, type, urlFieldId, linkId, progressId) {
  const file = input.files[0];
  if (!file) return;

  const progress = document.getElementById(progressId);
  progress.textContent = 'Laster opp…';
  progress.style.display = 'inline';

  const bucket  = type === 'pdf' ? PDF_BUCKET : MP3_BUCKET;
  const mime    = type === 'pdf' ? 'application/pdf' : 'audio/mpeg';
  // Sanitise filename: strip path separators and spaces
  const filename = file.name.replace(/[/\\]/g, '_').replace(/\s+/g, '_');
  const uploadUrl = `${SB.replace('/rest/v1','')}/storage/v1/object/${bucket}/${encodeURIComponent(filename)}`;

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey':         KEY,
        'Authorization':  `Bearer ${KEY}`,
        'Content-Type':   mime,
        'x-upsert':       'true',   // overwrite if same filename
      },
      body: file,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status}: ${err}`);
    }

    // Build the public URL
    const publicUrl = `${SB.replace('/rest/v1','')}/storage/v1/object/public/${bucket}/${encodeURIComponent(filename)}`;

    // Fill the URL field and show the open-link button
    const urlField = document.getElementById(urlFieldId);
    urlField.value = publicUrl;
    urlField.classList.add('has-value');
    urlField.dispatchEvent(new Event('input', { bubbles: true }));

    const link = document.getElementById(linkId);
    link.href = publicUrl;
    link.style.display = 'inline-block';

    progress.textContent = '✓ Opplastet';
    setTimeout(() => { progress.style.display = 'none'; }, 3000);
  } catch (err) {
    progress.textContent = '✗ Feil: ' + err.message;
    console.error('Storage upload error:', err);
  }

  // Reset the file input so the same file can be re-selected if needed
  input.value = '';
}

// ── Person photo upload ────────────────────────────────────────────────────

const PHOTO_BUCKET = 'person-photos';

function updatePersonPhotoPreview() {
  const url  = document.getElementById('p_photoUrl').value.trim();
  const img  = document.getElementById('p_photoPreview');
  const link = document.getElementById('p_photoLink');
  if (url) {
    img.src = url;
    img.style.display = 'inline-block';
    link.href = url;
    link.style.display = 'inline-block';
  } else {
    img.style.display = 'none';
    link.style.display = 'none';
  }
}

// Extract the storage object path (bucket-relative filename) from a public photo URL.
// Returns null if the URL doesn't point into our PHOTO_BUCKET (e.g. blank, or an external URL).
function extractPhotoStoragePath(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const encodedPath = url.slice(idx + marker.length);
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

async function deletePersonPhotoFromStorage(storagePath) {
  if (!storagePath) return;
  const deleteUrl = `${SB.replace('/rest/v1','')}/storage/v1/object/${PHOTO_BUCKET}/${encodeURIComponent(storagePath)}`;
  try {
    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey':        KEY,
        'Authorization': `Bearer ${KEY}`,
      },
    });
    if (!res.ok) {
      // Non-fatal: old file just stays orphaned, but don't block the new photo from being saved
      console.warn('Old photo delete failed:', res.status, await res.text());
    }
  } catch (err) {
    console.warn('Old photo delete error:', err);
  }
}

async function uploadPersonPhoto(input) {
  const file = input.files[0];
  if (!file) return;

  const progress = document.getElementById('p_photoProgress');
  progress.textContent = 'Laster opp…';
  progress.style.display = 'inline';

  // Capture the currently-set photo URL BEFORE we overwrite the field, so we can
  // delete the old storage object once the new upload succeeds.
  const previousUrl = document.getElementById('p_photoUrl').value.trim();
  const previousStoragePath = extractPhotoStoragePath(previousUrl);

  // Sanitise filename: strip path separators/spaces, prefix with person id + timestamp to avoid collisions
  const personId = document.getElementById('p_personId').value || 'new';
  const cleanName = file.name.replace(/[/\\]/g, '_').replace(/\s+/g, '_');
  const filename = `${personId}_${Date.now()}_${cleanName}`;
  const uploadUrl = `${SB.replace('/rest/v1','')}/storage/v1/object/${PHOTO_BUCKET}/${encodeURIComponent(filename)}`;

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey':        KEY,
        'Authorization': `Bearer ${KEY}`,
        'Content-Type':  file.type || 'image/jpeg',
        'x-upsert':      'true',
      },
      body: file,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status}: ${err}`);
    }

    const publicUrl = `${SB.replace('/rest/v1','')}/storage/v1/object/public/${PHOTO_BUCKET}/${encodeURIComponent(filename)}`;
    document.getElementById('p_photoUrl').value = publicUrl;
    updatePersonPhotoPreview();

    // New photo uploaded and field updated — safe to clean up the old one now.
    // Guard against deleting the file we just uploaded (shouldn't happen, but cheap to check).
    if (previousStoragePath && previousStoragePath !== filename) {
      await deletePersonPhotoFromStorage(previousStoragePath);
    }

    progress.textContent = '✓ Opplastet';
    setTimeout(() => { progress.style.display = 'none'; }, 3000);
  } catch (err) {
    progress.textContent = '✗ Feil: ' + err.message;
    console.error('Photo upload error:', err);
  }

  input.value = '';
}

// Live "Åpne" buttons for manually typed PDF/MP3 URL fields
(function() {
  [['e_pdfUrl','e_pdfLink'],['e_mp3Url','e_mp3Link'],
   ['n_pdfUrl','n_pdfLink'],['n_mp3Url','n_mp3Link']].forEach(([inpId, linkId]) => {
    const inp  = document.getElementById(inpId);
    const link = document.getElementById(linkId);
    if (!inp || !link) return;
    inp.addEventListener('input', () => {
      const v = inp.value.trim();
      link.style.display = v ? 'inline-block' : 'none';
      link.href = v || '#';
    });
  });
})();

(function() {
  // Support both ?edit=ID (hosted) and #edit=ID (local file://)
  const p = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const editId = p.get('edit') || h.get('edit');
  if (editId) {
    switchTab('edit');
    loadEditForm(parseInt(editId));
  }
})();

// ── Arbeidsliste ──────────────────────────────────────────────────────────────

let arbeidsData   = { mangler: [], under_arbeid: [], interessant: [] };
let arbeidsSection = 'mangler';

async function loadArbeidsliste() {
  if (arbeidslisteLoaded) return;
  arbeidslisteLoaded = true;

  document.getElementById('arbeidsListArea').innerHTML =
    '<div style="color:var(--muted);font-size:.85rem;padding:1rem 0">Laster…</div>';

  // Fetch in parallel: all three categories
  const [mangler, underArbeid, interessant] = await Promise.all([
    // PD scores without MuseScore link, not flagged under_arbeid or to_investigate (null-safe)
    get('/composition?public_domain=eq.Yes&musescore_link=is.null&or=(under_arbeid.eq.false,under_arbeid.is.null)&or=(to_investigate.eq.false,to_investigate.is.null)&select=composition_id,title,year_composed&order=title&limit=500'),
    // Under arbeid
    get('/composition?under_arbeid=eq.true&select=composition_id,title,year_composed,musescore_link&order=title&limit=500'),
    // To investigate
    get('/composition?to_investigate=eq.true&select=composition_id,title,year_composed,musescore_link&order=title&limit=500'),
  ]);

  // Batch fetch composer names for all compositions
  const allIds = [...new Set([...mangler, ...underArbeid, ...interessant].map(c => c.composition_id))];
  if (allIds.length) {
    const cpRows = await get(`/composition_person?composition_id=in.(${allIds.join(',')})&role=eq.Composer&select=composition_id,person_id,credited_as&limit=1000`);
    const personIds = [...new Set(cpRows.map(r => r.person_id))];
    const persons = personIds.length
      ? await get(`/person?person_id=in.(${personIds.join(',')})&select=person_id,first_name,last_name`)
      : [];
    const personMap = Object.fromEntries(persons.map(p => [p.person_id, ((p.first_name||'') + ' ' + (p.last_name||'')).trim()]));

    const composerMap = {};
    for (const row of cpRows) {
      const name = row.credited_as || personMap[row.person_id] || '';
      if (!name) continue;
      composerMap[row.composition_id] = composerMap[row.composition_id]
        ? composerMap[row.composition_id] + ', ' + name
        : name;
    }
    [...mangler, ...underArbeid, ...interessant].forEach(c => {
      c._composer = composerMap[c.composition_id] || '';
    });
  }

  arbeidsData.mangler      = mangler;
  arbeidsData.under_arbeid = underArbeid;
  arbeidsData.interessant  = interessant;

  document.getElementById('countMangler').textContent     = mangler.length;
  document.getElementById('countUnderArbeid').textContent = underArbeid.length;
  document.getElementById('countInteressant').textContent = interessant.length;

  showArbeidsSection('mangler');
}

function showArbeidsSection(section) {
  arbeidsSection = section;

  // Highlight active sub-tab button
  ['Mangler','UnderArbeid','Interessant'].forEach(s => {
    const btn = document.getElementById('arbeidsTab' + s);
    if (btn) btn.style.fontWeight = (s.toLowerCase().replace(' ','') === section.replace('_','')) ? '700' : '';
  });
  // Simpler: just match by section key
  document.getElementById('arbeidsTabMangler').style.fontWeight     = section === 'mangler'      ? '700' : '';
  document.getElementById('arbeidsTabUnderArbeid').style.fontWeight = section === 'under_arbeid' ? '700' : '';
  document.getElementById('arbeidsTabInteressant').style.fontWeight = section === 'interessant'  ? '700' : '';

  const items = arbeidsData[section] || [];
  const area  = document.getElementById('arbeidsListArea');

  if (!items.length) {
    area.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:1rem 0">Ingen innføringer i denne kategorien.</div>';
    return;
  }

  const msCol = (section !== 'mangler');

  const rows = items.map(c => {
    const msCell = msCol
      ? `<td style="padding:0.35rem 0.6rem">${c.musescore_link
          ? `<a href="${c.musescore_link}" target="_blank" style="color:var(--accent);font-size:0.8rem">MuseScore ↗</a>`
          : '<span style="color:var(--muted);font-size:0.8rem">—</span>'}</td>`
      : '';
    const checkCell = section === 'mangler'
      ? `<td style="padding:0.35rem 0.6rem;text-align:center">
           <input type="checkbox" title="Merk som under arbeid"
             style="width:auto;margin:0;accent-color:#c07000;cursor:pointer"
             onchange="toggleUnderArbeid(this, ${c.composition_id})">
         </td>`
      : '';
    return `<tr id="arbeid-row-${c.composition_id}" style="border-bottom:1px solid var(--border)">
      <td style="padding:0.35rem 0.6rem">
        <a href="#" onclick="event.preventDefault();switchTab('edit');loadEditForm(${c.composition_id})"
           style="color:var(--ink);text-decoration:none;border-bottom:1px solid var(--border)">${escapeHtml(c.title)}</a>
      </td>
      <td style="padding:0.35rem 0.6rem;color:var(--muted);font-size:0.85rem">${escapeHtml(c._composer || '—')}</td>
      <td style="padding:0.35rem 0.6rem;color:var(--muted);font-size:0.85rem">${escapeHtml(c.year_composed || '—')}</td>
      ${msCell}
      ${checkCell}
    </tr>`;
  }).join('');

  const msHeader    = msCol                 ? '<th style="padding:0.35rem 0.6rem;font-weight:600;text-align:left">MuseScore</th>' : '';
  const checkHeader = section === 'mangler' ? '<th style="padding:0.35rem 0.6rem;font-weight:600;text-align:center;width:2.5rem">⚙</th>' : '';

  area.innerHTML = `
    <div style="font-size:0.82rem;color:var(--muted);margin-bottom:0.75rem">${items.length} innføringer</div>
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border);background:var(--surface)">
          <th style="padding:0.35rem 0.6rem;font-weight:600;text-align:left">Tittel</th>
          <th style="padding:0.35rem 0.6rem;font-weight:600;text-align:left">Komponist</th>
          <th style="padding:0.35rem 0.6rem;font-weight:600;text-align:left">År</th>
          ${msHeader}
          ${checkHeader}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function toggleUnderArbeid(checkbox, compositionId) {
  checkbox.disabled = true;
  try {
    await patch('composition', `composition_id=eq.${compositionId}`, { under_arbeid: true });
    // Remove from local data and re-render
    arbeidsData.mangler = arbeidsData.mangler.filter(c => c.composition_id !== compositionId);
    document.getElementById('countMangler').textContent = arbeidsData.mangler.length;
    const row = document.getElementById(`arbeid-row-${compositionId}`);
    if (row) row.remove();
  } catch(e) {
    checkbox.disabled = false;
    checkbox.checked  = false;
    showStatus('Kunne ikke lagre: ' + e.message, 'error');
  }
}

// ── Siste innføringer ─────────────────────────────────────────────────────────

async function loadSiste() {
  sisteLoaded = true;
  const area = document.getElementById('sisteArea');
  area.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:0.5rem 0">Laster…</div>';

  try {
    // Fetch last 10 compositions by id descending
    const comps = await get('/composition?select=composition_id,title,year_composed&order=composition_id.desc&limit=10');

    if (!comps.length) {
      area.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:0.5rem 0">Ingen innføringer funnet.</div>';
      return;
    }

    // Batch fetch composers
    const ids = comps.map(c => c.composition_id);
    const cpRows = await get(`/composition_person?composition_id=in.(${ids.join(',')})&role=eq.Composer&select=composition_id,person_id,credited_as&limit=50`);
    const personIds = [...new Set(cpRows.map(r => r.person_id))];
    const persons = personIds.length
      ? await get(`/person?person_id=in.(${personIds.join(',')})&select=person_id,first_name,last_name`)
      : [];
    const personMap = Object.fromEntries(persons.map(p => [p.person_id, ((p.first_name||'') + ' ' + (p.last_name||'')).trim()]));
    const composerMap = {};
    for (const row of cpRows) {
      const name = row.credited_as || personMap[row.person_id] || '';
      if (!name) continue;
      composerMap[row.composition_id] = composerMap[row.composition_id]
        ? composerMap[row.composition_id] + ', ' + name
        : name;
    }

    const rows = comps.map(c => `
      <tr id="siste-row-${c.composition_id}" style="border-bottom:1px solid var(--border)">
        <td style="padding:0.35rem 0.5rem;font-size:0.8rem;color:var(--muted);white-space:nowrap">#${c.composition_id}</td>
        <td style="padding:0.35rem 0.5rem">
          <a href="#" onclick="event.preventDefault();switchTab('edit');loadEditForm(${c.composition_id})"
             style="color:var(--ink);text-decoration:none;border-bottom:1px solid var(--border)">${escapeHtml(c.title||'(uten tittel)')}</a>
        </td>
        <td style="padding:0.35rem 0.5rem;color:var(--muted);font-size:0.85rem">${escapeHtml(composerMap[c.composition_id]||'—')}</td>
        <td style="padding:0.35rem 0.5rem;color:var(--muted);font-size:0.85rem;text-align:right">${escapeHtml(c.year_composed||'—')}</td>
        <td style="padding:0.35rem 0.5rem;text-align:right;white-space:nowrap">
          <button type="button" onclick="deleteSiste(${c.composition_id}, '${escapeJsAttr(c.title||'')}')"
            style="background:none;border:1px solid #c07070;color:#a03030;border-radius:3px;padding:0.2rem 0.6rem;font-size:0.8rem;cursor:pointer;font-family:inherit">
            Slett
          </button>
        </td>
      </tr>`).join('');

    area.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
        <thead>
          <tr style="border-bottom:2px solid var(--border);background:var(--surface)">
            <th style="padding:0.35rem 0.5rem;font-weight:600;text-align:left;color:var(--muted);font-size:0.8rem">ID</th>
            <th style="padding:0.35rem 0.5rem;font-weight:600;text-align:left">Tittel</th>
            <th style="padding:0.35rem 0.5rem;font-weight:600;text-align:left">Komponist</th>
            <th style="padding:0.35rem 0.5rem;font-weight:600;text-align:right">År</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch(e) {
    area.innerHTML = `<div style="color:#a03030;font-size:.85rem;padding:0.5rem 0">Feil: ${escapeHtml(e.message)}</div>`;
  }
}

async function deleteSiste(id, title) {
  // Check for attached scores first
  const scores = await get(`/score?composition_id=eq.${id}&select=score_id&limit=10`);
  let msg = `Slette «${title}» (ID ${id})?`;
  if (scores.length) {
    msg = `«${title}» har ${scores.length} tilknyttet score-rad${scores.length > 1 ? 'er' : ''}.\n\nSlett komposisjonen og alle tilknyttede score-rader?`;
  }
  if (!confirm(msg)) return;

  try {
    // Delete scores first (FK constraint), then composition_person, then composition
    if (scores.length) {
      await del('score', `composition_id=eq.${id}`);
    }
    await del('composition_person', `composition_id=eq.${id}`);
    await del('composition_tag', `composition_id=eq.${id}`);
    await del('composition', `composition_id=eq.${id}`);

    const row = document.getElementById(`siste-row-${id}`);
    if (row) row.remove();

    // Force reload next time
    sisteLoaded = false;
  } catch(e) {
    alert('Sletting mislyktes: ' + e.message);
  }
}
