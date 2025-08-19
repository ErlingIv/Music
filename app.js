
const lettersAll = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","Æ","Ø","Å"];

const translations = {
  en: {
    doc_title: "Erling’s Music Collections",
    nav_about: "About",
    nav_collections: "Collections",
    nav_composers: "Composers",
    nav_notes: "Notes",
    btn_lang_to_no: "Norsk",
    btn_lang_to_en: "English",
    btn_mode_dark: "Dark",
    btn_mode_light: "Light",
    hero_title: "Old scores: classic and popular music",
    hero_sub: "A hub for my spreadsheet-based catalogs (classical and popular Scandinavian music) with short explanations and live embeds.",
    cta_jump: "Jump to Collections ↓",
    about_title: "About",
    about_p: "Below you’ll find three published Google Sheets embedded directly on the page. Each card includes an <em>Open in a new tab</em> link if you prefer a full-screen view.",
    collections_title: "Collections",
    c1_title: "Old classical music",
    c1_desc: "Transcriptions of (mostly) my score-collection of known and unknown composers. Primarily music not easily available elsewhere and to a large extent by Norwegian musicians.",
    c2_title: "Old popular music",
    c2_desc: "Popular songs mostly from Norway and Sweden. You have to be a member of the popular-music group to see them, due to most being in the “copyright” zone.",
    c3_title: "Norges Melodier I–IV",
    c3_desc: "500 songs from Grieg’s and Alnæs’ four books of old Norwegian music. To see all, be a member of the group “Norges Melodier”.",
    open_new_tab: "Open in a new tab ↗",
    composers_title: "Composers",
    notes_title: "Notes",
    notes_p: "You can put research updates here — e.g., corrected attributions, publication trails, or links to IMSLP/MuseScore entries."
  },
  no: {
    doc_title: "Erlings musikksamlinger",
    nav_about: "Om",
    nav_collections: "Samlinger",
    nav_composers: "Komponister",
    nav_notes: "Notater",
    btn_lang_to_no: "Norsk",
    btn_lang_to_en: "English",
    btn_mode_dark: "Mørk",
    btn_mode_light: "Lys",
    hero_title: "Gamle noter: klassisk og populærmusikk",
    hero_sub: "En samling av mine regnearkbaserte kataloger (klassisk og populær skandinavisk musikk) med korte forklaringer og innebygde visninger.",
    cta_jump: "Gå til samlingene ↓",
    about_title: "Om",
    about_p: "Nedenfor finner du tre publiserte Google-regneark som er innebygd på siden. Hver kortseksjon har også lenken <em>Åpne i ny fane</em> for fullskjermsvisning.",
    collections_title: "Samlinger",
    c1_title: "Gamle klassiske noter",
    c1_desc: "Transkripsjoner av (hovedsakelig) min notesamling av kjente og ukjente komponister. Primært musikk som ikke er lett tilgjengelig andre steder og i stor grad av norske musikere.",
    c2_title: "Gammel populærmusikk",
    c2_desc: "Populære sanger, mest fra Norge og Sverige. Du må være medlem av gruppen for populærmusikk for å se dem, siden de fleste ligger i «opphavsrett»-sonen.",
    c3_title: "Norges Melodier I–IV",
    c3_desc: "500 sanger fra Griegs og Alnæs’ fire bøker med gammel norsk musikk. For å se alle, bli medlem av gruppen «Norges Melodier».",
    open_new_tab: "Åpne i ny fane ↗",
    composers_title: "Komponister",
    notes_title: "Notater",
    notes_p: "Her kan du legge inn forskningsoppdateringer — f.eks. korrigerte attribusjoner, utgivelsesspor eller lenker til IMSLP/MuseScore."
  }
};

function getDefaultLang() {
  return ((navigator.language || '').toLowerCase().startsWith('no')) ? 'no' : 'en';
}
function getLang() {
  const stored = localStorage.getItem('lang');
  return stored ? stored : getDefaultLang();
}
function tr(lang, key) {
  return (translations[lang] && translations[lang][key]) || translations.en[key] || '';
}
function applyI18n(lang) {
  document.documentElement.lang = (lang === 'no') ? 'no' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const html = tr(lang, key);
    if (html) el.innerHTML = html;
  });
  document.getElementById('langToggle').textContent = (lang === 'en') ? translations.en.btn_lang_to_no : translations.no.btn_lang_to_en;
  const isDark = document.body.classList.contains('dark');
  document.getElementById('modeToggle').textContent = isDark ? tr(lang, 'btn_mode_light') : tr(lang, 'btn_mode_dark');
  document.title = tr(lang, 'doc_title');
}

function initMode() {
  const saved = localStorage.getItem('mode');
  if (saved === 'dark') document.body.classList.add('dark');
  const lang = getLang();
  document.getElementById('modeToggle').textContent = document.body.classList.contains('dark')
    ? tr(lang, 'btn_mode_light') : tr(lang, 'btn_mode_dark');
}

function autoLink(text) {
  return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
function paragraphize(text) {
  if (!text) return '';
  const paras = text.trim().split(/\n\s*\n/).map(p => `<p class="muted">${autoLink(p).replace(/\n/g,'<br/>')}</p>`);
  return paras.join('');
}
function renderLetter(letter, data) {
  const frame = document.getElementById('alpha-frame');
  const composers = data[letter] || [];
  if (!composers.length) {
    frame.innerHTML = `<p class="muted">No entries for <strong>${letter}</strong>.</p>`;
    return;
  }
  const blocks = composers.map(c => {
    const name = c.url ? `<a href="${c.url}" target="_blank" rel="noopener">${c.name}</a>` : c.name;
    const years = (c.birth || c.death) ? ` <span style="font-weight:normal;color:#666;">(${c.birth || ''}–${c.death || ''})</span>` : '';
    const lis = c.works.map(w => {
      const title = w.url ? `<strong><a href="${w.url}" target="_blank" rel="noopener">${w.title}</a></strong>` : `<strong>${w.title}</strong>`;
      const bits = [];
      if (w.year) bits.push(`<span class="muted">(${w.year})</span>`);
      if (w.lyr) {
        let lyr = w.lyr;
        if (w.lyrUrl) lyr = `<a href="${w.lyrUrl}" target="_blank" rel="noopener">${lyr}</a>`;
        let line = `Lyricist: ${lyr}`;
        if (w.lb || w.ld) line += ` <span class="muted">(${w.lb || ''}–${w.ld || ''})</span>`;
        bits.push("<br/>" + line);
      }
      const notes = paragraphize(w.comments || '');
      if (notes) bits.push("<br/>" + notes);
      return `<li>${title} ${bits.join(' ')}</li>`;
    }).join('\n');
    return `<div><h3>${name}${years}</h3><ul>${lis}</ul></div>`;
  });
  frame.innerHTML = blocks.join('\n');
}
function buildLetterBar(data) {
  const letterbar = document.getElementById('letterbar');
  letterbar.innerHTML = '';
  let firstWithContent = null;
  lettersAll.forEach(ch => {
    const has = (data[ch] && data[ch].length);
    const btn = document.createElement('button');
    btn.className = 'letter';
    btn.setAttribute('role','tab');
    btn.setAttribute('aria-selected','false');
    btn.dataset.letter = ch;
    btn.textContent = ch;
    btn.disabled = !has;
    if (has && firstWithContent === null) firstWithContent = ch;
    btn.addEventListener('click', () => {
      document.querySelectorAll('#letterbar .letter').forEach(b => b.setAttribute('aria-selected','false'));
      btn.setAttribute('aria-selected','true');
      renderLetter(ch, data);
    });
    letterbar.appendChild(btn);
  });
  if (firstWithContent) {
    const firstBtn = letterbar.querySelector(`button[data-letter="${firstWithContent}"]`);
    if (firstBtn) {
      firstBtn.setAttribute('aria-selected','true');
      renderLetter(firstWithContent, data);
    }
  } else {
    document.getElementById('alpha-frame').innerHTML = `<p class="muted">No data.</p>`;
  }
}
async function initComposers() {
  const res = await fetch('data/composers.json');
  const data = await res.json();
  buildLetterBar(data);
}

window.addEventListener('DOMContentLoaded', () => {
  initMode();
  let lang = getLang();
  localStorage.setItem('lang', lang);
  applyI18n(lang);
  document.getElementById('langToggle').addEventListener('click', () => {
    lang = (lang === 'en') ? 'no' : 'en';
    localStorage.setItem('lang', lang);
    applyI18n(lang);
  });
  document.getElementById('modeToggle').addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('mode', isDark ? 'dark' : 'light');
    const langNow = getLang();
    document.getElementById('modeToggle').textContent = isDark
      ? translations[langNow].btn_mode_light : translations[langNow].btn_mode_dark;
  });
  document.getElementById('year').textContent = new Date().getFullYear();
  initComposers();
});
