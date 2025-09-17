// scripts/ingestBooks.mjs
// Ingest Gutenberg books into static per-chapter JSON under public/books/pg-<id>/
// Usage:
//   node scripts/ingestBooks.mjs --id 8164
//   node scripts/ingestBooks.mjs --all
import fs from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch';

const ROOT = process.cwd();
const LIB_PATH = path.join(ROOT, 'public', 'content', 'library.json');

const START_RE = /^\s*[*]{3}\s*START OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;
const END_RE   = /^\s*[*]{3}\s*END OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;
const FIRST_CHAPTER_RE = /\n\s*(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)(?:\.[^\n]*)?\s*\n/;

function log(...a){ console.log('[ingest]', ...a); }

function sliceBetweenMarkers(str) {
  const start = str.search(START_RE);
  const end = str.search(END_RE);
  if (start !== -1 && end !== -1 && end > start) {
    const afterStart = str.slice(start);
    const firstLineLen = (afterStart.match(/^[^\n]*\n/) || [''])[0].length;
    return str.slice(start + firstLineLen, end).trim();
  }
  return str.trim();
}

function stripTagsToText(html) {
  let s = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<(?:br|BR)\s*\/?>/g, '\n')
       .replace(/<\/p>/gi, '\n\n')
       .replace(/<\/h[1-6]>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  const map = {'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&rsquo;':'’','&lsquo;':'‘','&rdquo;':'”','&ldquo;':'“','&hellip;':'…','&mdash;':'—','&ndash;':'–'};
  s = s.replace(/&(nbsp|amp|lt|gt|quot|#39|rsquo|lsquo|rdquo|ldquo|hellip|mdash|ndash);/g, m => map[m] || m);
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function stripFrontMatterToFirstChapter(text) {
  const idx = text.search(FIRST_CHAPTER_RE);
  return idx !== -1 ? text.slice(idx).trim() : text.trim();
}

function chapterize(body) {
  // 1) Strict chapters
  const parts1 = body.split(/\n\s*(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)(?:\.[^\n]*)?\s*\n/);
  if (parts1.length > 1) {
    return parts1.map((p, i) => ({ title: `Chapter ${i || 1}`, text: p.trim() }))
                 .filter(c => c.text);
  }
  // 2) Story headings in ALL CAPS
  const storySplit = body.split(/\n{1,3}([A-Z][A-Z '\-:.0-9]{4,})\n{1,3}/);
  if (storySplit.length > 1) {
    const chapters = [];
    for (let i = 1; i < storySplit.length; i += 2) {
      const t = (storySplit[i] || '').trim();
      const c = (storySplit[i+1] || '').trim();
      if (t && c) chapters.push({ title: t, text: c });
    }
    if (chapters.length) return chapters;
  }
  // 3) Fallback: chunk by paragraphs (~60 paras)
  const paras = body.split(/\n{2,}/);
  const size = 60;
  const out = [];
  for (let i = 0; i < paras.length; i += size) {
    const slice = paras.slice(i, i + size).join('\n\n').trim();
    if (slice) out.push({ title: `Part ${1 + (i/size|0)}`, text: slice });
  }
  return out;
}

function paragraphs(text) {
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}

function isHtml(mime) {
  const m = (mime || '').toLowerCase();
  return m.includes('text/html') || m.includes('application/xhtml+xml');
}

async function fetchBest(id) {
  const textUtf = `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`;
  const textAlt = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  const htmlUrl = `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`;

  const headers = { 'User-Agent': 'PGWAIReader Ingest (Script)' };
  let res = await fetch(textUtf, { headers });
  if (!res.ok) { res = await fetch(htmlUrl, { headers }); }
  if (!res.ok) { res = await fetch(textAlt, { headers }); }
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${textUtf}`);

  const mime = res.headers.get('content-type') || '';
  if (isHtml(mime)) {
    const html = await res.text();
    const sliced = sliceBetweenMarkers(html);
    const txt = stripTagsToText(sliced);
    return stripFrontMatterToFirstChapter(txt);
  } else {
    const raw = await res.text();
    return stripFrontMatterToFirstChapter(sliceBetweenMarkers(raw));
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJSON(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2), 'utf8');
}

async function ingestOne(entry) {
  const id = entry.gutenbergId || entry.id || entry.gid;
  if (!id) throw new Error('Missing Gutenberg ID.');
  const title = entry.title || 'Untitled';
  const author = entry.author || 'P. G. Wodehouse';

  log(`Ingesting ${id} — ${title}`);

  const text = await fetchBest(id);
  const chaps = chapterize(text);

  const outDir = path.join(ROOT, 'public', 'books', `pg-${id}`);
  await ensureDir(outDir);

  let totalWords = 0;
  const manifestChapters = [];

  for (let i = 0; i < chaps.length; i++) {
    const idx = i + 1;
    const file = `ch-${String(idx).padStart(2, '0')}.json`;
    const paras = paragraphs(chaps[i].text);
    const words = chaps[i].text.split(/\s+/).filter(Boolean).length;
    totalWords += words;

    await writeJSON(path.join(outDir, file), {
      index: idx,
      title: chaps[i].title || `Chapter ${idx}`,
      paragraphs: paras
    });

    manifestChapters.push({
      index: idx,
      title: chaps[i].title || `Chapter ${idx}`,
      file,
      words
    });
  }

  await writeJSON(path.join(outDir, 'manifest.json'), {
    id,
    title,
    author,
    wordCount: totalWords,
    chapters: manifestChapters,
    license: {
      termsUrl: 'https://www.gutenberg.org/policy/license.html',
      landing: `https://www.gutenberg.org/ebooks/${id}`
    }
  });

  log(`✔ Wrote ${manifestChapters.length} chapters for ${id}`);
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const idFlag = args.find(a => a.startsWith('--id='));
  const id = idFlag ? Number(idFlag.split('=')[1]) : null;

  if (!all && !id) {
    console.log('Usage:');
    console.log('  node scripts/ingestBooks.mjs --id=8164');
    console.log('  node scripts/ingestBooks.mjs --all');
    process.exit(1);
  }

  let entries = [];
  if (all) {
    const raw = await fs.readFile(LIB_PATH, 'utf8').catch(() => '[]');
    const lib = JSON.parse(raw);
    entries = lib.filter(x => x.gutenbergId); // only PG items
  } else {
    entries = [{ gutenbergId: id, title: '(unknown)' }];
  }

  for (const e of entries) {
    try { await ingestOne(e); }
    catch (err) { console.error(`✖ Failed ${e.gutenbergId || e.id}:`, err.message); }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
