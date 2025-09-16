// netlify/functions/fetchBook.js
import fetch from 'node-fetch';

const START_RE = /^\s*[*]{3}\s*START OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;
const END_RE   = /^\s*[*]{3}\s*END OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;

// Headings & front matter
const CONTENTS_RE = /^\s*CONTENTS\s*$/mi;
const PRODUCED_BY_RE = /^(?:produced by|e-?text prepared by|transcriber'?s note)/i;
const FIRST_CHAPTER_RE =
  /\n\s*(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)(?:\.\s*[A-Z][^\n]{0,80})?\s*\n/;

// HTML checks
function isHtmlMime(mime) {
  const m = (mime || '').toLowerCase();
  return m.includes('text/html') || m.includes('application/xhtml+xml');
}

/* ---------- Core helpers ---------- */

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

function stripTagsKeepText(html) {
  let s = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<(?:br|BR)\s*\/?>/g, '\n')
       .replace(/<\/p>/gi, '\n\n')
       .replace(/<\/h[1-6]>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  const map = {
    '&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",
    '&rsquo;':'’','&lsquo;':'‘','&rdquo;':'”','&ldquo;':'“','&hellip;':'…',
    '&mdash;':'—','&ndash;':'–'
  };
  s = s.replace(/&(nbsp|amp|lt|gt|quot|#39|rsquo|lsquo|rdquo|ldquo|hellip|mdash|ndash);/g,
                m => map[m] || m);
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// Remove front matter before the first chapter; also drop “CONTENTS” & producer notes
function stripFrontMatterToFirstChapter(text) {
  const lines = text.split('\n');

  // Step 1: normalize obvious boilerplate lines at the very top
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Empty / whitespace-only
    if (!line) { i++; continue; }

    // Contents heading near top? mark but keep scanning until we find first chapter
    if (CONTENTS_RE.test(line)) {
      // skip the "CONTENTS" heading and following lines until a blank line
      i++;
      while (i < lines.length && lines[i].trim()) i++;
      // continue scanning – we still want to jump to first CHAPTER later
      i++; // consume the blank
      continue;
    }

    // Transcriber's note / produced by / e-text prepared by
    if (PRODUCED_BY_RE.test(line)) {
      // skip this block up to next blank line
      i++;
      while (i < lines.length && lines[i].trim()) i++;
      i++;
      continue;
    }

    // If we encounter "CHAPTER ..." early, break here
    if (/^(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)/.test(line)) {
      break;
    }

    // Preface/Intro/Editor’s note first? keep scanning but allow skip
    if (/^(PREFACE|FOREWORD|INTRODUCTION|Editor'?s Note)/i.test(line)) {
      // treat as front matter – skip that block
      i++;
      while (i < lines.length && lines[i].trim()) i++;
      i++;
      continue;
    }

    // If it looks like a decorative title/author page, skip a few lines
    if (/^by\s+P\.\s*G\.\s*Wodehouse/i.test(line) || /^P\.\s*G\.\s*Wodehouse$/i.test(line)) {
      i++;
      continue;
    }

    // Otherwise, if we haven't reached a chapter, keep advancing cautiously
    i++;
    // Safety stop: don't skip more than, say, first 400 lines—fallback if no chapters exist
    if (i > 400) break;
  }

  // At this point, i is roughly where content should start (either first chapter heading or later)
  const firstChapterIdx = text.search(FIRST_CHAPTER_RE);
  if (firstChapterIdx !== -1) {
    // start from the first chapter heading
    return text.slice(firstChapterIdx).trim();
  }

  // No chapter headings found: return trimmed text (e.g., short stories without formal “Chapter 1”)
  return text.trim();
}

function chapterizeFromText(title, body) {
  // 1) Strict “CHAPTER I” / “Chapter 1”
  const parts1 = body.split(/\n\s*(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)(?:\.[^\n]*)?\s*\n/);
  if (parts1.length > 1) {
    return parts1
      .map((p, i) => ({ title: `Chapter ${i || 1}`, content: p.trim() }))
      .filter(c => c.content);
  }

  // 2) Short-story style (ALL CAPS headings)
  const storySplit = body.split(/\n{1,3}([A-Z][A-Z '\-:.0-9]{4,})\n{1,3}/);
  if (storySplit.length > 1) {
    const chapters = [];
    for (let i = 1; i < storySplit.length; i += 2) {
      const t = (storySplit[i] || '').trim();
      const c = (storySplit[i+1] || '').trim();
      if (t && c) chapters.push({ title: t, content: c });
    }
    if (chapters.length) return chapters;
  }

  // 3) Fallback: paragraph chunks
  const paras = body.split(/\n{2,}/);
  const chunkSize = 60;
  const chapters = [];
  for (let i = 0; i < paras.length; i += chunkSize) {
    const slice = paras.slice(i, i + chunkSize).join('\n\n').trim();
    if (slice) chapters.push({ title: `Part ${1 + (i / chunkSize|0)}`, content: slice });
  }
  return chapters;
}

// Produce a neater chapter title from the first non-empty line
function tidyChapterTitle(rawTitle, fallback) {
  if (!rawTitle) return fallback;
  let t = rawTitle.trim();

  // De-shout if it’s full uppercase but not Roman numerals only
  if (t.length <= 120 && /[A-Z]/.test(t) && t === t.toUpperCase() && !/^[IVXLCDM. ]+$/.test(t)) {
    t = t[0] + t.slice(1).toLowerCase();
  }

  // Strip decorative dots / trailing hyphens
  t = t.replace(/^[\s.\-–—]+|[\s.\-–—]+$/g, '');

  // Keep it sane
  if (!t || t.length > 140) return fallback;
  return t;
}

/* ---------- Handler ---------- */

export const handler = async (event) => {
  try {
    const id = parseInt(event.queryStringParameters.id, 10);
    const prefer = (event.queryStringParameters.format || 'txt').toLowerCase();
    const title = event.queryStringParameters.title || '';

    if (!id) return { statusCode: 400, body: 'Missing id' };

    // Canonical candidates
    const textUtf = `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`;
    const textAlt = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
    const htmlUrl = `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`;

    const tryFetch = async (u) => fetch(u, { headers: { 'User-Agent': 'PGWAIReader (Netlify Function)' } });

    // Prefer text → HTML → alternate text
    let url = prefer === 'html' ? htmlUrl : textUtf;
    let res = await tryFetch(url);

    if (!res.ok && prefer !== 'html') {
      url = htmlUrl;
      res = await tryFetch(url);
    }
    if (!res.ok) {
      url = textAlt;
      res = await tryFetch(url);
    }
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);

    const mime = res.headers.get('content-type') || '';
    let chapters = [];
    let wordCount = 0;

    if (isHtmlMime(mime)) {
      const html = await res.text();
      const sliced = sliceBetweenMarkers(html);
      const textish = stripTagsKeepText(sliced);
      const trimmed = stripFrontMatterToFirstChapter(textish);
      chapters = chapterizeFromText(title, trimmed);
      // Improve headings using first line of each chapter when sensible
      chapters = chapters.map((c, i) => {
        const firstLine = (c.content.split(/\n+/).find(x => x.trim()) || '').trim();
        const better = tidyChapterTitle(firstLine, c.title || `Chapter ${i||1}`);
        return { title: better, content: c.content };
      });
      wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    } else {
      const raw = await res.text();
      const body = stripFrontMatterToFirstChapter(sliceBetweenMarkers(raw));
      chapters = chapterizeFromText(title, body);
      chapters = chapters.map((c, i) => {
        const firstLine = (c.content.split(/\n+/).find(x => x.trim()) || '').trim();
        const better = tidyChapterTitle(firstLine, c.title || `Chapter ${i||1}`);
        return { title: better, content: c.content };
      });
      wordCount = body.split(/\s+/).filter(Boolean).length;
    }

    // Final prune
    chapters = (chapters || []).filter(c => c && typeof c.content === 'string' && c.content.trim());

    const license = {
      sentence: 'This eBook is for the use of anyone anywhere in the United States and most other parts of the world…',
      termsUrl: 'https://www.gutenberg.org/policy/license.html',
      landing: `https://www.gutenberg.org/ebooks/${id}`
    };

    return {
      statusCode: 200,
      headers: {
        'Cache-Control': 'public, max-age=86400',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ id, title, wordCount, chapters, license })
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: String(e) }) };
  }
};
