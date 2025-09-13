// netlify/functions/define.js
// Server-side dictionary lookup with two passes:
// 1) free-dictionary (dictionaryapi.dev)
// 2) Datamuse fallback (md=d)
// Returns a unified "entries" array compatible with your DictionaryModal.

const DICT_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const DATAMUSE = 'https://api.datamuse.com/words';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: cors, body: '' };
    }
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };
    }

    const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? `?${event.rawQuery}` : ''}`);
    const raw = (url.searchParams.get('word') || '').trim();
    const word = normalizeWord(raw);
    if (!word) {
      return json({ entries: [], error: 'Missing or invalid word parameter.' }, 400);
    }

    // Pass 1: dictionaryapi.dev
    const d1 = await tryFreeDictionary(word);
    if (d1.ok && d1.entries.length > 0) {
      return json({ entries: d1.entries });
    }

    // Pass 2: Datamuse fallback
    const d2 = await tryDatamuse(word);
    if (d2.ok && d2.entries.length > 0) {
      return json({ entries: d2.entries });
    }

    // Nothing found anywhere
    return json({ entries: [] });
  } catch (err) {
    return json({ entries: [], error: err?.message || 'Internal error' }, 500);
  }
};

function json(obj, statusCode = 200) {
  return {
    statusCode,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj),
  };
}

function normalizeWord(str) {
  let w = (str || '').trim();
  w = w.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[—–]/g, '-');
  w = w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''); // strip edge punctuation
  w = w.replace(/('s|’s)$/i, '');                // possessives
  if (w.includes("'")) w = w.split("'")[0];      // contractions → left part
  if (w.includes("’")) w = w.split("’")[0];
  w = w.toLowerCase();
  const m = w.match(/^[a-z][a-z\-]*$/i);
  return m ? m[0] : '';
}

async function tryFreeDictionary(word) {
  try {
    const resp = await fetch(DICT_BASE + encodeURIComponent(word));
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const isJSON = ct.includes('application/json');
    if (resp.status === 404) return { ok: true, entries: [] };
    if (!resp.ok) {
      const msg = isJSON ? JSON.stringify(await resp.json()) : (await resp.text());
      throw new Error(`dictionaryapi.dev failed (${resp.status}): ${msg.slice(0, 300)}`);
    }
    const data = isJSON ? await resp.json() : [];
    return { ok: true, entries: Array.isArray(data) ? data : [] };
  } catch (e) {
    // Consider network/API failure as hard error
    return { ok: false, entries: [], error: e.message };
  }
}

async function tryDatamuse(word) {
  try {
    const url = `${DATAMUSE}?sp=${encodeURIComponent(word)}&md=d&max=1`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Datamuse failed (${resp.status}): ${t.slice(0, 300)}`);
    }
    const arr = await resp.json();
    if (!Array.isArray(arr) || arr.length === 0) return { ok: true, entries: [] };
    const item = arr[0];
    const defs = Array.isArray(item.defs) ? item.defs : [];
    const meanings = defs.map((d) => {
      const [pos, def] = d.split('\t');
      return { partOfSpeech: pos || 'definition', definitions: [{ definition: def || d }] };
    });
    const entries = meanings.length ? [{ word: item.word || word, phonetic: '', meanings }] : [];
    return { ok: true, entries };
  } catch (e) {
    return { ok: false, entries: [], error: e.message };
  }
}
