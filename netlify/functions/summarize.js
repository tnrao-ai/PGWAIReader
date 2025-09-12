// netlify/functions/summarize.js
// Node-style Netlify Function (runs on AWS Lambda under the hood)

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { prompt } = JSON.parse(event.body || '{}');
    if (!prompt || typeof prompt !== 'string') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing prompt' })
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server missing OPENAI_API_KEY' })
      };
    }

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // upgrade to 'gpt-4o'/'gpt-4.1' if you want
        input: [
          "Summarize the following chapter in 4–6 sentences, neutral tone, no spoilers beyond the chapter:",
          prompt
        ],
        temperature: 0.4,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `OpenAI error ${resp.status}: ${text}` }),
      };
    }

    const data = await resp.json();
    const summary =
      data?.output_text ||
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      'No summary available.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err?.message || 'Unknown error' }),
    };
  }
};
