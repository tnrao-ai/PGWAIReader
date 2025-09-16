// netlify/functions/fetchBook.js
import fetch from 'node-fetch';

const START_RE = /^\s*[*]{3}\s*START OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;
const END_RE   = /^\s*[*]{3}\s*END OF (THIS|THE) PROJECT GUTENBERG EBOOK[\s\S]*?[*]{3}\s*$/mi;

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
  // remove scripts/styles entirely
  let s = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  // replace common breaks with newlines for readability
  s = s.replace(/<(?:br|BR)\s*\/?>/g, '\n')
       .replace(/<\/p>/gi, '\n\n')
       .replace(/<\/h[1-6]>/gi, '\n\n');

  // drop all tags
  s = s.replace(/<[^>]+>/g, '');

  // minimal entity decode for common ones
  const map = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&lsquo;': '‘',
    '&rdquo;': '”', '&ldquo;': '“', '&hellip;': '…', '&mdash;': '—', '&ndash;': '–'
  };
  s = s.replace(/&(nbsp|amp|lt|gt|quot|#39|rsquo|lsquo|rdquo|ldquo|hellip|mdash|ndash);/g,
                m => map[m] || m);

  // collapse excessive blank lines
  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

function chapterizeFromText(title, body) {
  // 1) "CHAPTER I"/"Chapter 1" patterns
  const parts1 = body.split(/\n\s*(?:CHAPTER\s+(?:[IVXLCDM]+|\d+)|Chapter\s+\d+)\s*\n/);
  if (parts1.length > 1) {
    return parts1.map((p, i) => ({ title: `Chapter ${i || 1}`, content: p.trim() }))
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

  // 3) Fallback: chunk by paragraphs
  const paras = body.split(/\n{2,}/);
  const chunkSize = 60;
  const chapters = [];
  for (let i = 0; i < paras.length; i += chunkSize) {
    const slice = paras.slice(i, i + chunkSize).join('\n\n').trim();
    if (slice) chapters.push({ title: `Part ${1 + (i / chunkSize|0)}`, content: slice });
  }
  return chapters;
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
      // split on headings first
      const rawParts = sliced.split(/<h[23][^>]*>/i);
      const parts = rawParts.length > 1 ? rawParts : [sliced];

      const chapterTexts = parts.map((frag, i) => {
        // if we split on headings, put back a marker so the first line becomes the chapter title after stripping
        const withHeader = i === 0 ? frag : `<h2>Chapter ${i}</h2>${frag}`;
        return stripTagsKeepText(withHeader);
      }).filter(Boolean);

      chapters = chapterTexts.map((t, i) => {
        // Title: first non-empty line, else "Chapter N"
        const firstLine = (t.split(/\n+/).find(x => x.trim()) || '').trim();
        const content = t.trim();
        const chTitle = firstLine && firstLine.length <= 120 ? firstLine : `Chapter ${i || 1}`;
        return { title: chTitle, content };
      }).filter(c => c.content);

      const fullText = chapters.map(c => c.content).join('\n\n');
      wordCount = fullText.split(/\s+/).filter(Boolean).length;
    } else {
      const raw = await res.text();
      const body = sliceBetweenMarkers(raw);
      chapters = chapterizeFromText(title, body);
      const fullText = body;
      wordCount = fullText.split(/\s+/).filter(Boolean).length;
    }

    // Final prune
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
    return { statusCode: 502, body: JSON.stringify({ error: String(e) }) };
  }
};
