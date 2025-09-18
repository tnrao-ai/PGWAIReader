// netlify/functions/fetchBook.js
import fetch from 'node-fetch';

// Block these non-Wodehouse IDs everywhere
const DENYLIST = new Set([43317, 44143, 63727, 63736]);

// Markers & helpers
const START_RE = /^\s*[*]{3}\s*START OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;
const END_RE   = /^\s*[*]{3}\s*END OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;

const CONTENTS_RE = /^\s*CONTENTS\s*$/mi;
const PRODUCED_BY_RE = /^(?:produced by|e-?text prepared by|transcriber'?s note)/i;
const FIRST_CHAPTER_RE =
  /\n\s*(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)(?:\.\s*[A-Z][^\n]{0,80})?\s*\n/;

function isHtmlMime(mime) {
  const m = (mime || '').toLowerCase();
  return m.includes('text/html') || m.includes('application/xhtml+xml');
}

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

function stripFrontMatterToFirstChapter(text) {
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (CONTENTS_RE.test(line)) {
      i++; while (i < lines.length && lines[i].trim()) i++; i++; continue;
    }
    if (PRODUCED_BY_RE.test(line)) {
      i++; while (i < lines.length && lines[i].trim()) i++; i++; continue;
    }
    if (/^(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)/.test(line)) break;
    if (/^(PREFACE|FOREWORD|INTRODUCTION|Editor'?s Note)/i.test(line)) {
      i++; while (i < lines.length && lines[i].trim()) i++; i++; continue;
    }
    if (/^by\s+P\.\s*G\.\s*Wodehouse/i.test(line) || /^P\.\s*G\.\s*Wodehouse$/i.test(line)) { i++; continue; }
    i++;
    if (i > 400) break;
  }

  const firstChapterIdx = text.search(FIRST_CHAPTER_RE);
  if (firstChapterIdx !== -1) return text.slice(firstChapterIdx).trim();
  return text.trim();
}

function chapterizeFromText(title, body) {
  // Strict CHAPTER splits
  const parts1 = body.split(/\n\s*(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)(?:\.[^\n]*)?\s*\n/);
  if (parts1.length > 1) {
    return parts1.map((p, i) => ({ title: `Chapter ${i || 1}`, content: p.trim() }))
                 .filter(c => c.content);
  }
  // ALL CAPS story titles
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
  // Fallback: chunk by ~60 paragraphs
  const paras = body.split(/\n{2,}/);
  const size = 60;
  const out = [];
  for (let i = 0; i < paras.length; i += size) {
    const slice = paras.slice(i, i + size).join('\n\n').trim();
    if (slice) out.push({ title: `Part ${1 + (i/size|0)}`, content: slice });
  }
  return out;
}

function tidyChapterTitle(rawTitle, fallback) {
  if (!rawTitle) return fallback;
  let t = rawTitle.trim();
  if (t.length <= 120 && /[A-Z]/.test(t) && t === t.toUpperCase() && !/^[IVXLCDM. ]+$/.test(t)) {
    t = t[0] + t.slice(1).toLowerCase();
  }
  t = t.replace(/^[\s.\-–—]+|[\s.\-–—]+$/g, '');
  if (!t || t.length > 140) return fallback;
  return t;
}

export const handler = async (event) => {
  try {
    const id = parseInt(event.queryStringParameters.id, 10);
    const prefer = (event.queryStringParameters.format || 'txt').toLowerCase();
    const title = event.queryStringParameters.title || '';

    if (!id) return { statusCode: 400, body: 'Missing id' };
    if (DENYLIST.has(id)) return { statusCode: 403, body: 'This title is not available in this library.' };

    const textUtf = `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`;
    const textAlt = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
    const htmlUrl = `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`;

    const tryFetch = async (u) => fetch(u, { headers: { 'User-Agent': 'PGWAIReader (Netlify Function)' } });

    let url = prefer === 'html' ? htmlUrl : textUtf;
    let res = await tryFetch(url);
    if (!res.ok && prefer !== 'html') { url = htmlUrl; res = await tryFetch(url); }
    if (!res.ok) { url = textAlt; res = await tryFetch(url); }
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);

    const mime = res.headers.get('content-type') || '';
    let chapters = [];
    let wordCount = 0;

    if (isHtmlMime(mime)) {
      const html = await res.text();
      const sliced = sliceBetweenMarkers(html);
      const textish = stripTagsKeepText(sliced);
      const trimmed = stripFrontMatterToFirstChapter(textish);
      chapters = chapterizeFromText(title, trimmed).map((c, i) => {
        const firstLine = (c.content.split(/\n+/).find(x => x.trim()) || '').trim();
        const better = tidyChapterTitle(firstLine, c.title || `Chapter ${i||1}`);
        return { title: better, content: c.content };
      });
      wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    } else {
      const raw = await res.text();
      const body = stripFrontMatterToFirstChapter(sliceBetweenMarkers(raw));
      chapters = chapterizeFromText(title, body).map((c, i) => {
        const firstLine = (c.content.split(/\n+/).find(x => x.trim()) || '').trim();
        const better = tidyChapterTitle(firstLine, c.title || `Chapter ${i||1}`);
        return { title: better, content: c.content };
      });
      wordCount = body.split(/\s+/).filter(Boolean).length;
    }

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
