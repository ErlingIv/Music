// Translation utility for score.html

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
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=no&dt=t&q=${encodeURIComponent(plainText)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    const translated = data[0].map(x => x[0]).join('');
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
