// Translation utility for score.html
// Uses MyMemory free translation API (no key required)

let _translated = false;

async function translateNotes(btn) {
  const originalText = window._notesRaw || '';
  const el = document.getElementById('notesText');

  if (_translated) {
    el.innerHTML = originalText.replace(/\n/g, '<br>');
    btn.textContent = 'Translate to Norwegian';
    _translated = false;
    btn.disabled = false;
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Translating…';

  try {
    const plainText = originalText.replace(/<[^>]+>/g, '');
    const resp = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(plainText)}&langpair=en|nb`
    );
    const data = await resp.json();
    if (data.responseStatus !== 200) throw new Error('Translation error: ' + data.responseStatus);
    const translated = data.responseData.translatedText;
    el.innerHTML = translated.replace(/\n/g, '<br>');
    btn.textContent = 'Show original';
    _translated = true;
  } catch (e) {
    console.error('Translation failed:', e);
    btn.textContent = 'Translation failed';
  }

  btn.disabled = false;
}
