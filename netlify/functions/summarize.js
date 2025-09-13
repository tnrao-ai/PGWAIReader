// netlify/functions/summarize.js
import { ensureUS } from './_geo.js';

export default async (request, context) => {
  // Geo-restrict to USA
  const deny = ensureUS(context);
  if (deny) return deny;

  try {
    if (request.method !== 'POST') {
      return json({ error: 'Use POST with JSON: { prompt: "..." }' }, 405);
    }

    // We’re intentionally not invoking any model for now.
    // Return a friendly placeholder so the UI can show a message.
    const body = await request.json().catch(() => ({}));

    return json({
      summary: "Chapter summaries are temporarily disabled while we complete the Games section. Please check back soon!"
    }, 200, {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
  } catch (err) {
    return json({ error: err?.message || 'Server error' }, 500, {
      'Access-Control-Allow-Origin': '*'
    });
  }
};

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}
