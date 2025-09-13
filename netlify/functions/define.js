// netlify/functions/define.js
export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('word') || '').trim().toLowerCase();
    if (!q) return json({ entries: [], error: 'Missing "word" query param.' }, 400);

    // Try the word, then a few simple lemmas
    const candidates = unique([q, ...lemmaCandidates(q)]);

    let aggregated = [];
    for (const term of candidates) {
      const fromPrimary = await safeDictionaryApi(term);
      if (fromPrimary.length) {
        aggregated = fromPrimary;
        break;
      }
      const fromWikt = await safeWiktionary(term);
      if (fromWikt.length) {
        aggregated = fromWikt;
        break;
      }
    }

    // Always respond with the same shape
    return json({ entries: aggregated }, 200, {
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
  } catch (err) {
    return json({ entries: [], error: err?.message || 'Server error' }, 500, {
      'Access-Control-Allow-Origin': '*'
    });
  }
};

/* ---------------- helpers ---------------- */

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function lemmaCandidates(word) {
  const out = [];
  // plural → singular (very rough)
  if (word.endsWith('ies') && word.length > 3) out.push(word.slice(0, -3) + 'y');
  if (word.endsWith('es') && word.length > 2) out.push(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) out.push(word.slice(0, -1));
  // verb forms
  if (word.endsWith('ing') && word.length > 4) {
    out.push(word.slice(0, -3));
    out.push(word.slice(0, -3) + 'e'); // running → run, making → make
  }
  if (word.endsWith('ed') && word.length > 3) {
    out.push(word.slice(0, -2));
    out.push(word.slice(0, -1)); // hoped → hope / loved → love
  }
  return unique(out);
}

async function safeFetchJSON(url, opts = {}, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': 'WodehouseReader/1.0', ...(opts.headers || {}) } });
    if (!resp.ok) return { ok: false, status: resp.status, data: null };
    const data = await resp.json().catch(() => null);
    return { ok: true, status: resp.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(to);
  }
}

/* Provider 1: Free Dictionary API (https://api.dictionaryapi.dev/) */
async function safeDictionaryApi(word) {
  const { ok, data } = await safeFetchJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!ok || !Array.isArray(data)) return [];
  return normalizeDictionaryApi(data);
}

function normalizeDictionaryApi(arr) {
  // https://github.com/meetDeveloper/freeDictionaryAPI
  return arr.map(entry => ({
    word: entry.word,
    phonetic: entry.phonetic || (Array.isArray(entry.phonetics) && entry.phonetics[0]?.text) || '',
    meanings: Array.isArray(entry.meanings)
      ? entry.meanings.map(m => ({
          partOfSpeech: m.partOfSpeech || '',
          definitions: (m.definitions || []).map(d => ({
            definition: d.definition || '',
            example: d.example || ''
          })).filter(d => d.definition)
        })).filter(m => m.definitions?.length)
      : []
  })).filter(e => e.meanings?.length);
}

/* Provider 2: Wiktionary REST (no key) */
async function safeWiktionary(word) {
  // en.wiktionary.org/api/rest_v1/#/Page%20content/get_page_definition__term_
  const { ok, data } = await safeFetchJSON(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
  if (!ok || !data || typeof data !== 'object') return [];
  return normalizeWiktionary(word, data);
}

function normalizeWiktionary(word, data) {
  const langs = ['en', 'en-us', 'en-gb'];
  const blocks = langs.flatMap(l => data[l] || []);
  if (!blocks.length) return [];
  return [{
    word,
    phonetic: '',
    meanings: blocks.map(b => ({
      partOfSpeech: b.partOfSpeech || '',
      definitions: (b.definitions || []).map(d => ({
        definition: d.definition || '',
        example: (Array.isArray(d.examples) && d.examples[0]) || ''
      })).filter(d => d.definition)
    })).filter(m => m.definitions?.length)
  }].filter(e => e.meanings?.length);
}
