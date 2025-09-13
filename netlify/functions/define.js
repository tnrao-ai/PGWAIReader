// netlify/functions/define.js
import https from 'node:https';
import { URL } from 'node:url';

export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('word') || '').trim().toLowerCase();
    if (!q) return json({ entries: [], error: 'Missing "word" query param.' }, 400);

    const candidates = unique([q, ...lemmaCandidates(q)]);

    let aggregated = [];
    let lastStatuses = [];
    for (const term of candidates) {
      const p1 = await dictionaryApi(term);
      lastStatuses.push(p1._status ?? -1);
      if (p1.entries.length) { aggregated = p1.entries; break; }

      const p2 = await wiktionaryApi(term);
      lastStatuses.push(p2._status ?? -1);
      if (p2.entries.length) { aggregated = p2.entries; break; }
    }

    // If nothing came back AND all probes look like network errors, surface an error
    const allZero = lastStatuses.length > 0 && lastStatuses.every(s => s === 0);
    if (!aggregated.length && allZero) {
      return json({ entries: [], error: 'Upstream dictionary providers unreachable (network).' }, 200, {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
    }

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
  if (word.endsWith('ies') && word.length > 3) out.push(word.slice(0, -3) + 'y');
  if (word.endsWith('es') && word.length > 2) out.push(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) out.push(word.slice(0, -1));
  if (word.endsWith('ing') && word.length > 4) {
    out.push(word.slice(0, -3));
    out.push(word.slice(0, -3) + 'e');
  }
  if (word.endsWith('ed') && word.length > 3) {
    out.push(word.slice(0, -2));
    out.push(word.slice(0, -1));
  }
  return unique(out);
}

function httpsGetJson(u, { timeoutMs = 6000, headers = {} } = {}) {
  const urlObj = new URL(u);
  const opts = {
    method: 'GET',
    headers: {
      'User-Agent': 'PGWAIReader/1.0',
      'Accept': 'application/json',
      ...headers
    }
  };

  return new Promise((resolve) => {
    const req = https.request(urlObj, opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = data ? JSON.parse(data) : null;
            resolve({ ok: true, status: res.statusCode, data: parsed });
          } catch {
            resolve({ ok: false, status: res.statusCode, data: null });
          }
        } else {
          resolve({ ok: false, status: res.statusCode || 0, data: null });
        }
      });
    });

    req.on('error', () => resolve({ ok: false, status: 0, data: null }));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Timeout'));
      resolve({ ok: false, status: 0, data: null });
    });

    req.end();
  });
}

/* Provider 1: Free Dictionary API */
async function dictionaryApi(word) {
  const { ok, status, data } = await httpsGetJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!ok || !Array.isArray(data)) return { entries: [], _status: status ?? 0 };
  return { entries: normalizeDictionaryApi(data), _status: status ?? 200 };
}

function normalizeDictionaryApi(arr) {
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

/* Provider 2: Wiktionary REST */
async function wiktionaryApi(word) {
  const { ok, status, data } = await httpsGetJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
  if (!ok || !data || typeof data !== 'object') return { entries: [], _status: status ?? 0 };
  const entries = normalizeWiktionary(word, data);
  return { entries, _status: status ?? 200 };
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
