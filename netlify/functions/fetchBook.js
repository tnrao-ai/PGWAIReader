// netlify/functions/fetchBook.js
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const START_RE = /^\s*[*]{3}\s*START OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;
const END_RE   = /^\s*[*]{3}\s*END OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;

function stripBoilerplate(raw) {
  const lines = raw.split('\n');
  const startIdx = lines.findIndex(l => START_RE.test(l));
  const endIdx   = lines.findIndex(l => END_RE.test(l));
  const body = (startIdx >= 0 && endIdx > startIdx)
    ? lines.slice(startIdx + 1, endIdx).join('\n')
    : raw;
  return body.trim();
}

// Series-aware chapterization
function chapterizeText(title, body) {
  // 1) Chapter I / Chapter 1 etc.
  const parts1 = body.split(/\n\s*(?:CHAPTER\s+(?:[IVXLCDM]+|\d+)|Chapter\s+\d+)\s*\n/);
  if (parts1.length > 1) {
    return parts1.map((p, i) => ({ title: `Chapter ${i || 1}`, content: p.trim() }))
                 .filter(c => c.content);
  }

  // 2) Short stories in all caps lines
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

  // 3) Fallback: chunk paragraphs
  const paras = body.split(/\n{2,}/);
  const chunkSize = 60;
  const chapters = [];
  for (let i = 0; i < paras.length; i += chunkSize) {
    const slice = paras.slice(i, i + chunkSize).join('\n\n').trim();
    if (slice) chapters.push({ title: `Part ${1 + (i / chunkSize|0)}`, content: slice });
  }
  return chapters;
}

function chapterizeHTML(title, cleanHTML) {
  const parts = cleanHTML.split(/<h[23][^>]*>/i);
  if (parts.length > 1) {
    return parts.map((p, i) => {
      const content = (i ? '<h2>' : '') + p;
      return { title: `Chapter ${i || 1}`, content };
    }).filter(c => c.content && c.content.replace(/<[^>]+>/g,'').trim());
  }
  const one = cleanHTML.trim();
  return one ? [{ title: 'Text', content: one }] : [];
}

function isHtmlMime(mime) {
  const m = (mime || '').toLowerCase();
  return m.includes('text/html') || m.includes('application/xhtml+xml');
}

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

    // Prefer text first (fast, stable); fallback to HTML; then alternate text
    const tryFetch = async (u) => fetch(u, { headers: { 'User-Agent': 'PGWAIReader (Netlify Function)' } });

    let url = prefer === 'html' ? htmlUrl : textUtf;
    let res = await tryFetch(url);

    if (!res.ok && prefer !== 'html') {
      // Try HTML if utf-8 text missing
      url = htmlUrl;
      res = await tryFetch(url);
    }
    if (!res.ok && prefer !== 'txt') {
      // Last resort: cache/epub text
      url = textAlt;
      res = await tryFetch(url);
    }
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);

    const mime = res.headers.get('content-type') || '';
    let chapters = [];
    let wordCount = 0;

    if (isHtmlMime(mime)) {
      const html = await res.text();
      const startMatch = html.match(START_RE);
      const endMatch = html.match(END_RE);
      let slice = html;
      if (startMatch && endMatch) {
        slice = html.slice(startMatch.index + startMatch[0].length, endMatch.index);
      }
      const dom = new JSDOM(slice);
      const DOMPurify = createDOMPurify(dom.window);
      const clean = DOMPurify.sanitize(dom.window.document.body.innerHTML || '');
      chapters = chapterizeHTML(title, clean);
      const textOnly = clean.replace(/<[^>]+>/g, ' ');
      wordCount = textOnly.split(/\s+/).filter(Boolean).length;
    } else {
      const raw = await res.text();
      const body = stripBoilerplate(raw);
      chapters = chapterizeText(title, body);
      wordCount = body.split(/\s+/).filter(Boolean).length;
    }

    // Final prune in case upstream produced empties
    chapters = (chapters || []).filter(c =>
      c && typeof c.content === 'string' && c.content.trim()
    );

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
    return { statusCode: 500, body: String(e) };
  }
};
