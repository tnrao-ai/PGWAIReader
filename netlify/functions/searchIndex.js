// netlify/functions/searchIndex.js
// Build a plain-text index for a PG book (used when only HTML is available).
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

export const handler = async (event) => {
  try {
    const id = parseInt(event.queryStringParameters.id, 10);
    if (!id) return { statusCode: 400, body: 'Missing id' };
    const htmlUrl = `https://www.gutenberg.org/cache/epub/${id}/pg${id}-images.html`;
    const res = await fetch(htmlUrl, { headers: { 'User-Agent': 'PGWAIReader (Netlify Function)' } });
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    const html = await res.text();
    const dom = new JSDOM(html);
    const text = dom.window.document.body.textContent || '';
    return { statusCode: 200, body: JSON.stringify({ id, text }) };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};
