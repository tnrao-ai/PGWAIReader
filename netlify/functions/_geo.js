// netlify/functions/_geo.js
export function ensureUS(context) {
  // Netlify provides geo info under context.geo
  // https://docs.netlify.com/functions/geo-location/
  const country = context?.geo?.country?.code || '';
  if (country !== 'US') {
    return new Response(
      JSON.stringify({ error: 'This service is only available in the United States.' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }
  return null; // meaning "allowed"
}
