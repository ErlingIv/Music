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
      { headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` } }
    );
    const data = await resp.json();
    _corrections = Array.isArray(data) ? data : [];
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

async function translateNotes(btn) {
  const originalText = window._notesRaw || '';
  const el = document.getElementById('notesText');

  if (!originalText) return;

  if (_translated) {
    el.innerHTML = originalText.replace(/\n/g, '<br>');
    btn.textContent = 'Translate to Norwegian';
    _translated = false;
    btn.disabled = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Translating…';

  const corrections = await loadCorrections();

  try {
    const plainText = originalText.replace(/<[^>]+>/g, '');
    const resp = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(plainText)}&langpair=en|nb`
    );
    const data = await resp.json();
    if (data.responseStatus !== 200) throw new Error('Status ' + data.responseStatus);
    const translated = applyCorrections(data.responseData.translatedText, corrections);
    if (!translated) throw new Error('No translation returned');
    el.innerHTML = translated.replace(/\n/g, '<br>');
    btn.textContent = 'Show original';
    _translated = true;
  } catch (e) {
    console.error('Translation failed:', e);
    btn.textContent = 'Translation failed';
  }

  btn.disabled = false;
}
