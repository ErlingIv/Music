const SB   = 'https://tfqnzszyjsdgdeksizel.supabase.co/rest/v1';
const KEY  = 'sb_publishable_TxNG1PKrOD3NuBwCKzEfMA_b3-21kij';
const H    = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`,
               'Content-Type': 'application/json', 'Prefer': 'return=representation' };

function downloadSelf() {
  const html = document.documentElement.outerHTML;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// ── API ───────────────────────────────────────────────────────────────────────

async function get(path) {
  const r = await fetch(SB + path, { headers: H });
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

// ── Tabs ──────────────────────────────────────────────────────────────────────

let bioLoaded        = false;
let arbeidslisteLoaded = false;

function switchTab(name) {
  if (name === 'biolinks' && !bioLoaded) loadBioPersons();
  if (name === 'arbeidsliste' && !arbeidslisteLoaded) loadArbeidsliste();
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
    <h3 style="margin:0;font-size:1rem">${name} — ${comps.length} komposisjoner</h3>
    <button type="button" onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer">✕</button>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
    <tr style="border-bottom:2px solid #eee"><th style="text-align:left;padding:0.3rem">Tittel</th><th>År</th><th>PD</th><th>MS</th></tr>
    ${comps.map(c => `<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:0.3rem">${c.title}</td>
      <td style="text-align:center;color:#666">${c.year_composed||'—'}</td>
      <td style="text-align:center">${c.public_domain==='Yes'?'✓':''}</td>
      <td style="text-align:center">${c.musescore_link?`<a href="${c.musescore_link}" target="_blank">🔗</a>`:''}</td>
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
  let t;

  inp.addEventListener('input', () => {
    clearTimeout(t);
    const q = inp.value.trim();
    if (q.length < 2) { res.classList.remove('open'); return; }
    t = setTimeout(async () => {
      const rows = await get(`/person?last_name=ilike.${encodeURIComponent(q)}*&select=person_id,first_name,last_name,nationality,born,died,pseudonym&limit=12&order=last_name`);
      res.innerHTML = '';
      rows.forEach(p => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        const flag = p.nationality ? countryCodeToFlag(p.nationality) : '';
        const years = p.born ? ` ${p.born}${p.died ? '–'+p.died : ''}` : '';
        const d = document.createElement('div');
        d.className = 'lookup-item';
        d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:0.5rem';
        const left = document.createElement('span');
        left.innerHTML = `${flag} ${name}<span style="color:var(--muted);font-size:0.8rem">${years}</span>`;
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

// ── Publisher lookup factory ──────────────────────────────────────────────────

function makePubLookup(searchId, resultsId, hiddenId, stateObj, key) {
  const inp = document.getElementById(searchId);
  const res = document.getElementById(resultsId);
  let t;

  inp.addEventListener('input', () => {
    clearTimeout(t);
    stateObj[key] = null;
    document.getElementById(hiddenId).value = '';
    const q = inp.value.trim();
    if (q.length < 2) { res.classList.remove('open'); return; }
    t = setTimeout(async () => {
      const rows = await get(`/publisher?publisher_name=ilike.*${encodeURIComponent(q)}*&select=publisher_id,publisher_name&limit=10&order=publisher_name`);
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

async function resolvePublisher(searchId, stateObj, key) {
  if (stateObj[key]) return stateObj[key];
  const name = document.getElementById(searchId).value.trim();
  if (!name) return null;
  const existing = await get(`/publisher?publisher_name=eq.${encodeURIComponent(name)}&select=publisher_id`);
  if (existing.length > 0) return existing[0].publisher_id;
  const np = await post('publisher', { publisher_name: name });
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
  return sourceMap.get(name.trim()) || null;
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
function nAddContributorRow(person, role) { addContributorRow('n', nContributors, nRowIdxRef, person, role, ''); }

const ROLES = ['Composer','Lyricist','Arranger','Illustrator'];
const ROLE_NO = { Composer:'Komponist', Lyricist:'Tekstforfatter', Arranger:'Arrangør', Illustrator:'Illustratør' };


// ── Shared contributor row factory ────────────────────────────────────────────

function addContributorRow(prefix, contributors, rowIdxRef, person, role, creditedAs) {
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
      <div id="${prefix}_cselected_${idx}" style="font-size:0.82rem;color:var(--accent);margin-top:0.2rem;font-weight:500">${name||''}</div>
      <div id="${prefix}_ccredited_wrap_${idx}" style="margin-top:0.3rem"></div>
    </div>
    <button type="button" id="${prefix}_cremove_${idx}" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--muted);padding:0.2rem;line-height:1;margin-top:1.8rem">✕</button>`;
  list.appendChild(div);
  contributors.push({ idx, person_id: person?.person_id||null, name, credited_as: creditedAs||'' });
  if (person) {
    renderCreditedAsField(prefix, idx, person.pseudonym||'', creditedAs||'');
  }

  // Remove button
  document.getElementById(`${prefix}_cremove_${idx}`).addEventListener('click', () => {
    document.getElementById(`${prefix}_crow_${idx}`)?.remove();
    const i = contributors.findIndex(c => c.idx === idx);
    if (i !== -1) contributors.splice(i, 1);
  });

  // Search input
  let searchTimer;
  document.getElementById(`${prefix}_csearch_${idx}`).addEventListener('input', function() {
    clearTimeout(searchTimer);
    const val = this.value;
    const res = document.getElementById(`${prefix}_cresults_${idx}`);
    if (val.length < 2) { res.innerHTML = ''; res.style.display = 'none'; return; }
    searchTimer = setTimeout(async () => {
      const rows = await get(`/person?last_name=ilike.${encodeURIComponent(val)}*&select=person_id,first_name,last_name,born,died&order=last_name.asc&limit=10`);
      if (!rows.length) { res.innerHTML = ''; res.style.display = 'none'; return; }
      res.style.display = 'block';
      res.innerHTML = rows.map(p => {
        const pname = [p.first_name,p.last_name].filter(Boolean).join(' ');
        const dates = p.born||p.died ? ` (${[p.born,p.died].filter(Boolean).join('–')})` : '';
        return `<div class="lookup-item" data-pid="${p.person_id}" data-name="${pname.replace(/"/g,'&quot;')}"><span class="lookup-name">${pname}</span><span class="lookup-meta">${dates}</span></div>`;
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
  const btn = document.getElementById('newSubmitBtn');

  // Duplicate gate
  const warnVisible = document.getElementById('n_duplicateWarn').style.display !== 'none';
  if (warnVisible && !document.getElementById('n_notDuplicate').checked) {
    showMsg('newMsg', '⚠ Mulige duplikater funnet — bekreft at dette ikke er et duplikat før du lagrer.', 'error');
    document.getElementById('newMsg').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Lagrer…';
  showMsg('newMsg', '', '');
  try {
    const title    = document.getElementById('n_title').value.trim();
    const year     = document.getElementById('n_year').value.trim();
    const cat      = document.getElementById('n_category').value;
    const notes      = document.getElementById('n_notes').value.trim();
    const dedication = document.getElementById('n_dedication').value.trim();
    const msLink   = document.getElementById('n_msLink').value.trim();
    const toInvestigate = document.getElementById('n_toInvestigate').checked;
    const underArbeid   = document.getElementById('n_underArbeid').checked;
    const plate    = document.getElementById('n_plateNumber').value.trim();
    if (!title) throw new Error('Tittel er påkrevd.');
    if (!cat)   throw new Error('Kategori er påkrevd.');

    const pubDomain = cat === 'pd' ? 'Yes' : 'No';
    const catName   = cat === 'pd' ? 'Eldre klassisk' : 'Eldre populærmusikk';
    const pubId     = await resolvePublisher('n_publisherSearch', nPubState, 'id');

    // Validate source BEFORE writing anything to the database
    const source   = document.getElementById('n_source').value;
    if (!validateSource('n_source')) { btn.disabled = false; btn.textContent = 'Lagre innføring'; return; }

    const comp = await post('composition', { title, public_domain: pubDomain, year_composed: year||null, opus_number: document.getElementById('n_opus').value.trim()||null, composition_notes: notes||null, musescore_link: msLink||null, dedication: dedication||null, to_investigate: toInvestigate||null, under_arbeid: underArbeid||null });
    const compId = comp.composition_id;
    if (!compId) throw new Error('Feil ved lagring.');

    for (const c of nContributors) {
      if (!c.person_id) continue;
      const role = document.getElementById(`n_crole_${c.idx}`)?.value || 'Composer';
      await post('composition_person', { composition_id: compId, person_id: c.person_id, role, credited_as: c.credited_as || null });
    }

    // Score duplicate check: same plate number + same title already in DB?
    if (plate) {
      const dupScores = await get(`/score?plate_number=eq.${encodeURIComponent(plate)}&select=score_id,composition_id,plate_number`);
      if (dupScores.length) {
        // Fetch composition titles for the matching scores
        const dupIds = dupScores.map(s => s.composition_id).join(',');
        const dupComps = await get(`/composition?composition_id=in.(${dupIds})&select=composition_id,title`);
        const titleMap = Object.fromEntries(dupComps.map(c => [c.composition_id, c.title]));
        const dupLines = dupScores.map(s => `• "${titleMap[s.composition_id] || '?'}" (score_id=${s.score_id}, plate=${s.plate_number})`).join('<br>');
        // Show warning in newMsg and require confirmation
        showMsg('newMsg', '', '');
        const msgEl = document.getElementById('newMsg');
        msgEl.innerHTML = `<div style="background:#fff8e8;border:1px solid #e8c84a;border-radius:4px;padding:0.6rem 0.85rem;font-size:0.85rem;color:#5a4a00">
          <div style="font-weight:600;margin-bottom:0.35rem">⚠ Noteeksemplar med platenummer <em>${plate}</em> finnes allerede:</div>
          <div style="margin-bottom:0.5rem">${dupLines}</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.4rem">
            <button id="scoreDupConfirm" class="btn" style="font-size:0.8rem;padding:0.25rem 0.6rem;background:#c8a000;color:#fff;border:none;border-radius:4px;cursor:pointer">Lagre likevel</button>
            <button onclick="document.getElementById('newMsg').innerHTML=''" class="btn btn-secondary" style="font-size:0.8rem;padding:0.25rem 0.6rem">Avbryt</button>
          </div>
        </div>`;
        msgEl.className = 'msg';
        btn.disabled = false; btn.textContent = 'Lagre innføring';
        // Wire confirm button to finish the save
        document.getElementById('scoreDupConfirm').onclick = async () => {
          msgEl.innerHTML = '';
          btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Lagrer…';
          await post('score', { composition_id: compId, category: catName, plate_number: plate||null, publisher_id: pubId||null, pdf_url: document.getElementById('n_pdfUrl').value.trim()||null, mp3_url: document.getElementById('n_mp3Url').value.trim()||null, source_id: getSourceId(source)||null });
          showMsg('newMsg', `✓ "${title}" er lagret (id=${compId})`, 'success');
          resetNewForm();
          btn.disabled = false; btn.textContent = 'Lagre innføring';
        };
        return;
      }
    }

    await post('score', { composition_id: compId, category: catName, plate_number: plate||null, publisher_id: pubId||null, pdf_url: document.getElementById('n_pdfUrl').value.trim()||null, mp3_url: document.getElementById('n_mp3Url').value.trim()||null, source_id: getSourceId(source)||null });

    showMsg('newMsg', `✓ "${title}" er lagret (id=${compId})`, 'success');
    resetNewForm();
  } catch(err) {
    showMsg('newMsg', 'Feil: ' + err.message, 'error');
  }
  btn.disabled = false; btn.textContent = 'Lagre innføring';
});

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

let dupCheckTimeout;
document.getElementById('n_title').addEventListener('input', () => {
  clearTimeout(dupCheckTimeout);
  hideDuplicateWarn();
  const q = document.getElementById('n_title').value.trim();
  if (q.length < 2) return;
  dupCheckTimeout = setTimeout(async () => {
    const results = await get(`/composition?title=ilike.*${encodeURIComponent(q)}*&select=composition_id,title,year_composed,public_domain&limit=8&order=title`);
    if (!results.length) return;
    const list = document.getElementById('n_duplicateList');
    list.innerHTML = results.map(c => {
      const year = c.year_composed ? ` (${c.year_composed})` : '';
      const pd   = c.public_domain === 'Yes' ? ' · PD' : '';
      return `<div style="padding:0.2rem 0;border-bottom:1px solid #e8d88a;display:flex;align-items:center;justify-content:space-between;gap:0.75rem">
        <span>${c.title}${year}${pd}</span>
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
function eAddContributorRow(person, role, creditedAs)  { addContributorRow('e', eContributors, eRowIdxRef, person, role, creditedAs); }

makePubLookup('e_publisherSearch', 'e_publisherResults', 'e_publisherId', ePubState, 'id');

let editSearchTimeout;
document.getElementById('editApprovalFilter').addEventListener('change', () => {
  const q = document.getElementById('editSearch').value.trim();
  if (q.length >= 2) searchCompositions(q);
});

document.getElementById('editMusescoreFilter').addEventListener('change', () => {
  const q = document.getElementById('editSearch').value.trim();
  if (q.length >= 2) searchCompositions(q);
});

document.getElementById('editInvestigateFilter').addEventListener('change', () => {
  const q = document.getElementById('editSearch').value.trim();
  if (q.length >= 2) searchCompositions(q);
});

document.getElementById('editSearchMode').addEventListener('change', () => {
  const mode = document.getElementById('editSearchMode').value;
  document.getElementById('editSearch').placeholder = mode === 'composer' ? 'Søk på komponist…' : 'Søk på tittel…';
  document.getElementById('editSearch').value = '';
  document.getElementById('editSearchResults').innerHTML = '';
});

document.getElementById('editSearch').addEventListener('input', () => {
  clearTimeout(editSearchTimeout);
  const q = document.getElementById('editSearch').value.trim();
  document.getElementById('editSearchResults').innerHTML = '';
  if (q.length < 2) return;
  editSearchTimeout = setTimeout(() => searchCompositions(q), 300);
});

async function searchCompositions(q) {
  const approvalFilter    = document.getElementById('editApprovalFilter').value;
  const mode              = document.getElementById('editSearchMode').value;
  const container         = document.getElementById('editSearchResults');
  container.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:.5rem 0">Søker…</div>';

  const msFilter          = document.getElementById('editMusescoreFilter').value;
  const investigateFilter = document.getElementById('editInvestigateFilter').value;
  const underArbeidFilter = document.getElementById('editUnderArbeidFilter').value;
  const approvalQ   = approvalFilter === 'approved' ? '&approved=eq.true' : (approvalFilter === 'unapproved' || approvalFilter === 'hide_approved') ? '&approved=eq.false' : '';
  const msQ         = msFilter === 'with_link' ? '&musescore_link=not.is.null' : msFilter === 'without_link' ? '&musescore_link=is.null' : '';
  const invQ        = investigateFilter === 'investigate' ? '&to_investigate=eq.true' : '';
  const arbeidQ     = underArbeidFilter === 'under_arbeid' ? '&under_arbeid=eq.true' : '';
  let results = [];

  if (mode === 'title') {
    results = await get(`/composition?title=ilike.*${encodeURIComponent(q)}*&select=composition_id,title,year_composed,public_domain,approved,musescore_link,to_investigate,under_arbeid${approvalQ}${msQ}${invQ}${arbeidQ}&limit=30&order=title`);

  } else {
    // Composer mode only — find persons, then their compositions
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
    if (approvalFilter === 'approved')                                           results = results.filter(r => r.approved);
    if (approvalFilter === 'unapproved' || approvalFilter === 'hide_approved')   results = results.filter(r => !r.approved);
    if (msFilter === 'with_link')    results = results.filter(r => r.musescore_link);
    if (msFilter === 'without_link') results = results.filter(r => !r.musescore_link);
    if (investigateFilter === 'investigate') results = results.filter(r => r.to_investigate);
    if (underArbeidFilter === 'under_arbeid') results = results.filter(r => r.under_arbeid);
    results.sort((a,b) => a.title.localeCompare(b.title));
  }

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
      ? ` · <span style="cursor:pointer;text-decoration:underline dotted" onclick="event.stopPropagation();openComposerScores(${c._composer_id||'null'},'${(c._composer||'').replace(/'/g,"\\'")}')">🎵 ${c._composer}</span>`
      : '';
    d.innerHTML = `<div class="result-title">${c.title}${approvedBadge}${investigateBadge}${underArbeidBadge}</div>
                   <div class="result-meta">${c.year_composed || '—'} · ${c.public_domain === 'Yes' ? 'PD' : 'Opphavsrett'}${composerMeta}</div>`;
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
    query:             document.getElementById('editSearch').value,
    mode:              document.getElementById('editSearchMode').value,
    approvalFilter:    document.getElementById('editApprovalFilter').value,
    msFilter:          document.getElementById('editMusescoreFilter').value,
    investigateFilter: document.getElementById('editInvestigateFilter').value,
    results:           document.getElementById('editSearchResults').innerHTML
  };
  document.getElementById('editSearchResults').innerHTML = '';
  document.getElementById('editSearch').value = '';

  const [comp, cpRaw, scores] = await Promise.all([
    get(`/composition?composition_id=eq.${compId}&select=*`),
    get(`/composition_person?composition_id=eq.${compId}&select=person_id,role,credited_as`),
    get(`/score?composition_id=eq.${compId}&select=*`)
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
    eAddContributorRow(row.person, row.role || 'Composer', row.credited_as || '');
  }
  if (!cp.length) eAddContributorRow(null, 'Composer');

  const score = scores[0];
  document.getElementById('e_scoreId').value = score ? score.score_id : '';
  document.getElementById('e_plateNumber').value = score?.plate_number || '';
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

  // Validate source BEFORE touching the database or showing the spinner
  const esource = document.getElementById('e_source').value;
  if (!validateSource('e_source')) return;

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
    });

    // Update contributors
    await del('composition_person', `composition_id=eq.${compId}`);
    for (const c of eContributors) {
      if (!c.person_id) continue;
      const role = document.getElementById(`e_crole_${c.idx}`)?.value || 'Composer';
      await post('composition_person', { composition_id: parseInt(compId), person_id: c.person_id, role, credited_as: c.credited_as || null });
    }

    // Update tags
    await del('composition_tag', `composition_id=eq.${compId}`);
    for (const cb of [...document.querySelectorAll('#e_tagCheckboxes input[type=checkbox]:checked')]) {
      await post('composition_tag', { composition_id: parseInt(compId), tag_id: parseInt(cb.value) });
    }

    // Update score
    const pubId   = await resolvePublisher('e_publisherSearch', ePubState, 'id');
    const plate   = document.getElementById('e_plateNumber').value.trim();
    const catName = cat === 'pd' ? 'Eldre klassisk' : 'Eldre populærmusikk';
    const scoreData = { plate_number: plate||null, publisher_id: pubId||null, category: catName, pdf_url: document.getElementById('e_pdfUrl').value.trim()||null, mp3_url: document.getElementById('e_mp3Url').value.trim()||null, source_id: getSourceId(esource)||null };

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
    document.getElementById('editSearchMode').value        = s.mode;
    document.getElementById('editApprovalFilter').value    = s.approvalFilter;
    document.getElementById('editMusescoreFilter').value   = s.msFilter;
    document.getElementById('editInvestigateFilter').value = s.investigateFilter || '';
    document.getElementById('editSearch').value            = s.query;
    // Re-run search to reflect any approval changes
    if (s.query.length >= 2) {
      searchCompositions(s.query);
    } else {
      document.getElementById('editSearchResults').innerHTML = s.results;
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

let personSearchTimeout;
document.getElementById('personSearch').addEventListener('input', () => {
  clearTimeout(personSearchTimeout);
  // Clear form when user starts typing a new search
  document.getElementById('personPanel').style.display = 'none';
  document.getElementById('personCompositions').innerHTML = '';
  const q = document.getElementById('personSearch').value.trim();
  if (q.length < 2) { document.getElementById('personSearchResults').innerHTML = ''; return; }
  personSearchTimeout = setTimeout(async () => {
    const rows = await get(`/person?last_name=ilike.${encodeURIComponent(q)}*&select=person_id,first_name,last_name,born,died,nationality,gender&limit=20&order=last_name`);
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
      personLeft.innerHTML = `<div class="result-title">${flag} ${p.first_name || ''} ${p.last_name}${femBadge}</div>
                     <div class="result-meta">${years}</div>`;
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
          <td style="padding:0.3rem 0.5rem">${c.title}</td>
          <td style="padding:0.3rem;color:var(--muted);font-size:0.78rem">${ROLE_NO[c.role]||c.role||''}</td>
          <td style="text-align:center;color:var(--muted);padding:0.3rem">${c.year_composed||'—'}</td>
          <td style="text-align:center;padding:0.3rem">${c.public_domain==='Yes'?'✓':''}</td>
          <td style="text-align:center;padding:0.3rem">${c.musescore_link?`<a href="${c.musescore_link}" target="_blank">🔗</a>`:''}</td>
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
      <div style="font-weight:600;margin-bottom:0.35rem">&#9888; Person finnes allerede: ${fullName}${yrs} [ID ${match.person_id}]</div>
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
      <div style="background:var(--paper);border:1px solid var(--border);border-radius:5px;padding:0.6rem 0.9rem;font-size:0.82rem;word-break:break-all;margin-bottom:1rem;font-family:monospace">${p.bio_url}</div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        <a class="btn btn-secondary" href="${p.bio_url}" target="_blank" style="font-size:0.85rem">🔗 Åpne lenke</a>
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
      <a href="#" onclick="switchTab('person');loadPersonForm(${p.person_id});return false;" style="color:inherit;text-decoration:none;border-bottom:1px solid var(--border)">${name}</a>
    </div>
    <div style="font-size:0.85rem;color:var(--muted);margin-bottom:1rem">${meta}</div>
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
          <a href="#" onclick="switchTab('edit');loadEditForm(${comp.composition_id});return false;" style="color:var(--accent);text-decoration:none">${comp.title}</a>${comp.year_composed ? ` <span style="color:var(--muted)">(${comp.year_composed})</span>` : ''}
          <span style="color:var(--muted);font-size:0.78rem;margin-left:1rem;white-space:nowrap">${(roleMap[comp.composition_id] || []).join(', ')}</span>
        </div>`).join('')}
    `;
    scoresDiv.style.display = 'block';
    btn.textContent = '♪ Skjul';
  } catch(e) {
    scoresDiv.innerHTML = `<em style="color:var(--accent)">Feil: ${e.message}</em>`;
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
 'n_publisherSearch','n_plateNumber','n_source','n_pdfUrl','n_mp3Url'].forEach(makeClearable);

// Edit form
['e_title','e_year','e_opus','e_msLink','e_notes','e_dedication',
 'e_msNotes','e_displayCountry',
 'e_publisherSearch','e_plateNumber','e_source','e_pdfUrl','e_mp3Url'].forEach(makeClearable);

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
  const p = new URLSearchParams(window.location.search);
  const editId = p.get('edit');
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
    // PD scores without MuseScore link, not flagged under_arbeid or to_investigate
    get('/composition?public_domain=eq.Yes&musescore_link=is.null&under_arbeid=not.eq.true&to_investigate=not.eq.true&select=composition_id,title,year_composed&order=title&limit=500'),
    // Under arbeid
    get('/composition?under_arbeid=eq.true&select=composition_id,title,year_composed,musescore_link&order=title&limit=500'),
    // To investigate
    get('/composition?to_investigate=eq.true&select=composition_id,title,year_composed,musescore_link&order=title&limit=500'),
  ]);

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
           style="color:var(--ink);text-decoration:none;border-bottom:1px solid var(--border)">${c.title}</a>
      </td>
      <td style="padding:0.35rem 0.6rem;color:var(--muted);font-size:0.85rem">${c.year_composed || '—'}</td>
      ${msCell}
      ${checkCell}
    </tr>`;
  }).join('');

  const msHeader    = msCol           ? '<th style="padding:0.35rem 0.6rem;font-weight:600;text-align:left">MuseScore</th>' : '';
  const checkHeader = section === 'mangler' ? '<th style="padding:0.35rem 0.6rem;font-weight:600;text-align:center;width:2.5rem">⚙</th>' : '';

  area.innerHTML = `
    <div style="font-size:0.82rem;color:var(--muted);margin-bottom:0.75rem">${items.length} innføringer</div>
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border);background:var(--surface)">
          <th style="padding:0.35rem 0.6rem;font-weight:600;text-align:left">Tittel</th>
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
