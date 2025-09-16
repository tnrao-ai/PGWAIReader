// scripts/buildLibrary.mjs
// Build a complete Wodehouse library.json using Gutendex (mirror of PG catalog).
// Output: public/content/library.json (covers + best text/html links, no extra stats)
import fs from 'node:fs/promises';
import fetch from 'node-fetch';

const GUTENDEX = 'https://gutendex.com/books?search=Wodehouse&languages=en';
const OUT = 'public/content/library.json';

// Fetch all paginated results
async function fetchAll(url) {
  let results = [];
  for (let next = url; next; ) {
    const res = await fetch(next);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const json = await res.json();
    results = results.concat(json.results || []);
    next = json.next;
  }
  return results;
}

function bestFormats(formats = {}) {
  const entries = Object.entries(formats);
  const textUtf = entries.find(([k]) => k.startsWith('text/plain;') && /utf-8/i.test(k));
  const textPlain = entries.find(([k]) => k.startsWith('text/plain'));
  const html1 = entries.find(([k]) => k.startsWith('text/html;') && /utf-8/i.test(k));
  const html2 = entries.find(([k]) => k.startsWith('text/html'));
  const cover = entries.find(([k]) => k.startsWith('image/jpeg'));
  return {
    textUrl: (textUtf || textPlain)?.[1] || null,
    htmlUrl: (html1 || html2)?.[1] || null,
    coverUrl: cover?.[1] || null
  };
}

// Simple canonical sort: series buckets (Jeeves, Blandings, Others), then alpha title
function seriesBucket(title) {
  const t = (title || '').toLowerCase();
  if (/(jeeves|bertie wooster)/i.test(title)) return 'JEEVES';
  if (/(blandings|earl of emsworth)/i.test(title)) return 'BLANDINGS';
  return 'OTHER';
}

const all = await fetchAll(GUTENDEX);
const filtered = all
  .filter(b => b.copyright === false && (b.languages||[]).includes('en'))
  .map(b => {
    const f = bestFormats(b.formats);
    return {
      id: `pg-${b.id}`,
      gutenbergId: b.id,
      title: b.title,
      author: (b.authors||[]).map(a => a.name).join(', ') || 'P. G. Wodehouse',
      language: (b.languages||[])[0] || 'en',
      coverUrl: f.coverUrl || `https://www.gutenberg.org/cache/epub/${b.id}/pg${b.id}.cover.medium.jpg`,
      textUrl: f.textUrl || `https://www.gutenberg.org/ebooks/${b.id}.txt.utf-8`,
      htmlUrl: f.htmlUrl || `https://www.gutenberg.org/cache/epub/${b.id}/pg${b.id}-images.html`,
      landing: `https://www.gutenberg.org/ebooks/${b.id}`,
      series: seriesBucket(b.title)
    };
  })
  .sort((a, b) => {
    if (a.series !== b.series) return a.series.localeCompare(b.series);
    return a.title.localeCompare(b.title);
  });

// Only the fields the app needs on the covers & reader
const slim = filtered.map(({ id, gutenbergId, title, author, language, coverUrl, textUrl, htmlUrl, landing, series }) => ({
  id, gutenbergId, title, author, language, coverUrl, textUrl, htmlUrl, landing, series
}));

await fs.mkdir('public/content', { recursive: true });
await fs.writeFile(OUT, JSON.stringify(slim, null, 2));
console.log(`Wrote ${slim.length} Wodehouse books to ${OUT}`);
