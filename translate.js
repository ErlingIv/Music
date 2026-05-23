// Translation utility for score.html
// Uses Claude API for English → Norwegian translation

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Translate the following text from English to Norwegian (Bokmål). Return only the translated text, nothing else.\n\n${plainText}`
        }]
      })
    });

    const data = await response.json();
    const translated = data.content?.[0]?.text;
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
