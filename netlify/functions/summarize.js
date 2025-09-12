// netlify/functions/summarize.js
// Node/Netlify Function (CommonJS) — no extra deps required

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: corsHeaders(),
        body: 'Method Not Allowed'
      };
    }

    let json;
    try {
      json = JSON.parse(event.body || '{}');
    } catch {
      return jsonError(400, 'Invalid JSON in request body');
    }

    const rawPrompt = (json.prompt || '').toString();
    if (!rawPrompt.trim()) {
      return jsonError(400, 'Missing prompt');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return jsonError(500, 'Server missing OPENAI_API_KEY');
    }

    // Clip very large inputs to keep request sizes safe and latency low
    const CHAR_LIMIT = 24000; // ~6k tokens rough estimate
    const prompt = rawPrompt.length > CHAR_LIMIT ? rawPrompt.slice(0, CHAR_LIMIT) : rawPrompt;

    // Use Chat Completions (stable)
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',           // upgrade to 'gpt-4o' / 'gpt-4.1' for higher quality
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'You are a concise literary summarizer. Provide a neutral 4–6 sentence summary of the given chapter. Avoid spoilers beyond the provided text.'
          },
          { role: 'user', content: prompt }
        ]
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      // Bubble up OpenAI error text
      return jsonError(502, `OpenAI error ${resp.status}: ${truncate(text, 600)}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return jsonError(502, `OpenAI returned non-JSON response: ${truncate(text, 600)}`);
    }

    const summary =
      data?.choices?.[0]?.message?.content?.trim() ||
      'No summary available.';

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary })
    };
  } catch (err) {
    return jsonError(500, err?.message || 'Unknown error');
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function jsonError(statusCode, message) {
  return {
    statusCode,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message })
  };
}

function truncate(s, n) {
  return (s || '').length > n ? s.slice(0, n) + '…' : s;
}
