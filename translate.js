// Translation utility for score.html
// Uses MyMemory free translation API (no key required)
// Corrections loaded dynamically from Supabase

let _translated = false;
let _corrections = null;

async function loadCorrections() {
  if (_corrections) return _corrections;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/translation_corrections?select=wrong,correct`,
      { headers: H }
    );
    const data = await resp.json();
    const rows = Array.isArray(data) ? data : [];
    _corrections = rows.sort((a, b) => b.wrong.length - a.wrong.length);
  } catch (e) {
    _corrections = [];
  }
  return _corrections;
}

function applyCorrections(text, corrections) {
  let result = text;
  for (const { wrong, correct } of corrections) {
    try {
      result = result.replace(new RegExp(wrong, 'gi'), correct);
    } catch(e) { /* skip bad regex */ }
  }
  return result;
}

async function translateChunk(text) {
  const resp = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|nb`
  );
  const data = await resp.json();
  if (data.responseStatus !== 200) throw new Error('Status ' + data.responseStatus);
  return data.responseData.translatedText;
}

async function translateNotes(btn) {
  const originalText = window._notesRaw || '';
  const el = document.getElementById('notesText');

  if (!originalText) return;

  if (_translated) {
    // Restore original — run through linkify so links are still clickable
    el.innerHTML = linkify(originalText.replace(/\n/g, '<br>'));
    btn.textContent = 'Translate to Norwegian';
    _translated = false;
    btn.disabled = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Translating…';

  const corrections = await loadCorrections();

  try {
    // Strip BBCode links before sending to translation API
    // [url=https://...]label[/url] → keep label text only for translation
    // Plain URLs → remove entirely (we'll re-linkify after)
    const strippedText = originalText
      .replace(/\[url=[^\]]+\]([^\[]*)\[\/url\]/gi, '$1')  // BBCode: keep label
      .replace(/https?:\/\/[^\s<\[]+/g, '');               // bare URLs: remove

    // Split into ~400 char chunks on sentence boundaries
    const sentences = strippedText.match(/[^.!?]+[.!?]+/g) || [strippedText];
    const chunks = [];
    let current = '';
    for (const s of sentences) {
      if ((current + s).length > 400) {
        if (current) chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    const parts = [];
    for (const chunk of chunks) {
      const t = await translateChunk(chunk);
      parts.push(t);
      await new Promise(r => setTimeout(r, 300));
    }

    const translated = applyCorrections(parts.join(' '), corrections);
    // Run through linkify in case any URLs survived stripping
    el.innerHTML = linkify(translated.replace(/\n/g, '<br>'));
    btn.textContent = 'Show original';
    _translated = true;
  } catch (e) {
    console.error('Translation failed:', e);
    btn.textContent = 'Translation failed';
  }

  btn.disabled = false;
}
