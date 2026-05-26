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
    // Replace all links with placeholders before translating, restore after.
    // Uses «L0», «L1» etc — unusual chars the translation API won't touch.
    const linkStore = [];
    const tokenised = originalText
      .replace(/\[url=(https?:\/\/[^\]]+)\]([^\[]*)\[\/url\]/gi, (match) => {
        linkStore.push(match);
        return `\u00abL${linkStore.length - 1}\u00bb`;
      })
      .replace(/(?<!\[url=)(?<!href=")(https?:\/\/[^\s<\[]+)/g, (match) => {
        linkStore.push(match);
        return `\u00abL${linkStore.length - 1}\u00bb`;
      });

    // Split into ~400 char chunks on sentence boundaries
    const sentences = tokenised.match(/[^.!?]+[.!?]+/g) || [tokenised];
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

    // Restore placeholders back to original BBCode, then linkify
    const withLinks = parts.join(' ').replace(/\u00abL(\d+)\u00bb/g, (_, i) => {
      return linkStore[parseInt(i)] || '';
    });

    const translated = applyCorrections(withLinks, corrections);
    el.innerHTML = linkify(translated.replace(/\n/g, '<br>'));
    btn.textContent = 'Show original';
    _translated = true;
  } catch (e) {
    console.error('Translation failed:', e);
    btn.textContent = 'Translation failed';
  }

  btn.disabled = false;
}
