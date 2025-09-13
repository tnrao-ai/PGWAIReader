// netlify/functions/summarize.js

/**
 * 🔧 TESTING MODE (enabled)
 * This handler always returns an "Under testing" message and NEVER calls OpenAI.
 * Keep this while validating UX or if you don't want to spend credits yet.
 *
 * ✅ To enable real summaries later:
 *   1) Comment out the TESTING handler below (lines between "TESTING MODE" markers).
 *   2) UNCOMMENT the PRODUCTION handler further down (search: "PRODUCTION MODE").
 *   3) Ensure your OPENAI_API_KEY is set in Netlify site env vars.
 */

// ===================== TESTING MODE (ACTIVE) =====================
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      summary:
        "Under testing: Summaries are temporarily disabled. We're validating the reader experience before enabling AI-generated chapter summaries."
    })
  };
};
// =================== END TESTING MODE (ACTIVE) ===================



/**
 * 🚀 PRODUCTION MODE (commented out)
 * Calls OpenAI Chat Completions API and returns a real summary.
 * UNCOMMENT this entire block to re-enable real summaries.
 *
 * Notes:
 * - Requires env var: OPENAI_API_KEY (Netlify → Site → Build & deploy → Environment variables)
 * - Model: gpt-4o-mini (change to gpt-4o / gpt-4.1 for higher quality and cost)
 */

// /* ===================== PRODUCTION MODE (DISABLED) =====================
// exports.handler = async (event) => {
//   try {
//     if (event.httpMethod !== 'POST') {
//       return { statusCode: 405, headers: corsHeaders(), body: 'Method Not Allowed' };
//     }
//
//     let json;
//     try {
//       json = JSON.parse(event.body || '{}');
//     } catch {
//       return jsonError(400, 'Invalid JSON in request body');
//     }
//
//     const rawPrompt = (json.prompt || '').toString();
//     if (!rawPrompt.trim()) return jsonError(400, 'Missing prompt');
//
//     const apiKey = process.env.OPENAI_API_KEY;
//     if (!apiKey) return jsonError(500, 'Server missing OPENAI_API_KEY');
//
//     // Clip to keep within safe bounds
//     const CHAR_LIMIT = 24000;
//     const prompt = rawPrompt.length > CHAR_LIMIT ? rawPrompt.slice(0, CHAR_LIMIT) : rawPrompt;
//
//     const resp = await fetch('https://api.openai.com/v1/chat/completions', {
//       method: 'POST',
//       headers: {
//         Authorization: `Bearer ${apiKey}`,
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         model: 'gpt-4o-mini',
//         temperature: 0.4,
//         messages: [
//           {
//             role: 'system',
//             content: 'You are a concise literary summarizer. Provide a neutral 4–6 sentence summary of the given chapter. Avoid spoilers beyond the provided text.'
//           },
//           { role: 'user', content: prompt }
//         ]
//       }),
//     });
//
//     const text = await resp.text();
//     if (!resp.ok) return jsonError(502, `OpenAI error ${resp.status}: ${truncate(text, 600)}`);
//
//     let data;
//     try { data = JSON.parse(text); }
//     catch { return jsonError(502, `OpenAI returned non-JSON response: ${truncate(text, 600)}`); }
//
//     const summary = data?.choices?.[0]?.message?.content?.trim() || 'No summary available.';
//
//     return {
//       statusCode: 200,
//       headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
//       body: JSON.stringify({ summary })
//     };
//   } catch (err) {
//     return jsonError(500, err?.message || 'Unknown error');
//   }
// };
//
// function corsHeaders() {
//   return {
//     'Access-Control-Allow-Origin': '*',
//     'Access-Control-Allow-Headers': 'Content-Type, Authorization',
//     'Access-Control-Allow-Methods': 'POST, OPTIONS'
//   };
// }
// function jsonError(statusCode, message) {
//   return {
//     statusCode,
//     headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
//     body: JSON.stringify({ error: message })
//   };
// }
// function truncate(s, n) { return (s || '').length > n ? s.slice(0, n) + '…' : s; }
// // =================== END PRODUCTION MODE (DISABLED) =================== */
// 
