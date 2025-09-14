// src/utils/dailyPicker.js

// Format today's date in America/Chicago as YYYY-MM-DD
export function centralDateStr(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, day] = fmt.format(d).split("-");
  return `${y}-${m}-${day}`; // YYYY-MM-DD
}

// A tiny deterministic RNG so the same day => same selection (until midnight CT)
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | 0) - c | 0;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

// Turn a string (date) into 4 uint seeds
function seedFromString(str) {
  let h1 = 0x9e3779b9, h2 = 0x243f6a88, h3 = 0xb7e15162, h4 = 0xdeadbeef;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = (h1 ^ ch) * 2654435761 >>> 0;
    h2 = (h2 ^ ch) * 1597334677 >>> 0;
    h3 = (h3 ^ ch) * 3812015801 >>> 0;
    h4 = (h4 ^ ch) * 1664525 >>> 0;
  }
  return [h1, h2, h3, h4];
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Pick up to `limit` questions with **no two from the same origin**
export function pickDailyQuiz(allQuestions, limit = 10, seed = centralDateStr()) {
  if (!Array.isArray(allQuestions)) return [];
  // Group by origin (fallback to id if origin missing)
  const byOrigin = new Map();
  for (const q of allQuestions) {
    const key = q.origin || q.id || JSON.stringify(q).slice(0, 40);
    if (!byOrigin.has(key)) byOrigin.set(key, []);
    byOrigin.get(key).push(q);
  }

  // Deterministic shuffle by seed
  const rng = sfc32(...seedFromString(String(seed)));
  const buckets = [...byOrigin.values()];
  shuffleInPlace(buckets, rng);

  const out = [];
  for (const bucket of buckets) {
    // pick one at random from this origin’s bucket
    out.push(bucket[Math.floor(rng() * bucket.length)]);
    if (out.length >= limit) break;
  }
  return out;
}

// Optional: persist the daily pick so a reload shows the same set
export function loadPersisted(seed = centralDateStr()) {
  try {
    const raw = localStorage.getItem(`jj_daily_${seed}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function persistDaily(ids, seed = centralDateStr()) {
  try { localStorage.setItem(`jj_daily_${seed}`, JSON.stringify(ids)); } catch {}
}
