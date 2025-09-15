// netlify/functions/wordweb.js
import fs from "fs";
import path from "path";

// ---------- tiny seeded RNG ----------
function xmur3(str) { // string -> 32-bit seed
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- normalize & parse ----------
function normalizeWord(w) {
  return String(w || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, ""); // strip spaces/punct; UI already does this on match
}

function loadWordList() {
  // file must be present in repo at build time; included with function bundle
  const filePath = path.resolve(process.cwd(), "public/content/games/wordweb/words.txt");
  const raw = fs.readFileSync(filePath, "utf8");
  // Accept tab/space/newline separated tokens (your upload is 1/line; this makes it robust)
  const words = raw
    .split(/\r?\n|\t|,/g)
    .map(normalizeWord)
    .filter(Boolean)
    .filter((w) => w.length >= 4 && w.length <= 12); // sensible bounds for 12×12
  // de-dup
  return Array.from(new Set(words));
}

// ---------- placement ----------
const DIRS = [
  { dx: 1, dy: 0, type: "H" },  // →
  { dx: -1, dy: 0, type: "H" }, // ←
  { dx: 0, dy: 1, type: "V" },  // ↓
  { dx: 0, dy: -1, type: "V" }, // ↑
  { dx: 1, dy: 1, type: "D" },  // ↘
  { dx: -1, dy: -1, type: "D" },// ↖
  { dx: 1, dy: -1, type: "D" }, // ↗
  { dx: -1, dy: 1, type: "D" }, // ↙
];

function canPlace(grid, N, word, x, y, dx, dy, noOverlap = true) {
  for (let i = 0; i < word.length; i++) {
    const xx = x + dx * i;
    const yy = y + dy * i;
    if (xx < 0 || yy < 0 || xx >= N || yy >= N) return false;
    const cell = grid[yy][xx];
    if (noOverlap) {
      if (cell !== null) return false;
    } else {
      if (cell !== null && cell !== word[i]) return false; // (not used; keeping for future)
    }
  }
  return true;
}

function placeWord(grid, N, word, rand, desiredType = null, maxTries = 800) {
  // Try a bunch of random starts/directions
  const directions = desiredType ? DIRS.filter(d => d.type === desiredType) : DIRS.slice();
  for (let t = 0; t < maxTries; t++) {
    const dir = directions[Math.floor(rand() * directions.length)];
    const x = Math.floor(rand() * N);
    const y = Math.floor(rand() * N);
    if (!canPlace(grid, N, word, x, y, dir.dx, dir.dy, /*noOverlap*/ true)) continue;
    for (let i = 0; i < word.length; i++) {
      const xx = x + dir.dx * i;
      const yy = y + dir.dy * i;
      grid[yy][xx] = word[i];
    }
    return dir.type; // placed as this type
  }
  return null;
}

function generatePuzzleForDate(dateStr, allWords) {
  const N = 12;
  // seed: date + a little salt from word count
  const seedFrom = xmur3(`${dateStr}|${allWords.length}`)();
  const rand = mulberry32(seedFrom);

  // deterministically pick 6 words
  const pool = seededShuffle(allWords, rand);
  const pick = [];
  for (let i = 0; i < pool.length && pick.length < 6; i++) {
    const w = pool[i];
    if (!pick.includes(w)) pick.push(w);
  }

  // ensure we have a variety: at least one H, one V, one D
  const targetTypes = ["H", "V", "D"]; // we’ll guarantee each appears at least once
  const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => null));
  const usedTypes = [];

  // 1) Place three words with required types (if fewer than 3 words, loop handles)
  for (let k = 0; k < Math.min(3, pick.length); k++) {
    const desired = targetTypes[k];
    const placedType = placeWord(grid, N, pick[k], rand, desired);
    if (!placedType) {
      // fallback: try any type
      const anyType = placeWord(grid, N, pick[k], rand, null);
      if (!anyType) throw new Error(`Failed to place word: ${pick[k]}`);
      usedTypes.push(anyType);
    } else {
      usedTypes.push(placedType);
    }
  }

  // 2) Place remaining words with any type (random)
  for (let k = 3; k < pick.length; k++) {
    const anyType = placeWord(grid, N, pick[k], rand, null);
    if (!anyType) throw new Error(`Failed to place word: ${pick[k]}`);
    usedTypes.push(anyType);
  }

  // 3) Fill remaining cells with random letters
  const randLetter = () => String.fromCharCode(65 + Math.floor(rand() * 26));
  const rows = grid.map(row =>
    row.map(ch => (ch === null ? randLetter() : ch)).join("")
  );

  return {
    theme: "Wodehouse Sampler",
    size: N,
    grid: rows,
    answers: pick, // already normalized uppercase
  };
}

export const config = {
  // ensure the words file is bundled with the function
  includedFiles: ["public/content/games/wordweb/words.txt"],
};

export async function handler(event) {
  try {
    // Expect ?date=YYYY-MM-DD (America/Chicago). If missing, default to today's Central date.
    const url = new URL(event.rawUrl || `http://x/?${event.rawQuery || ""}`);
    let date = url.searchParams.get("date");
    if (!date) {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const [y, m, d] = fmt.format(new Date()).split("-");
      date = `${y}-${m}-${d}`;
    }

    const words = loadWordList();
    const puzzle = generatePuzzleForDate(date, words);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify(puzzle),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err?.message || err) }),
    };
  }
}
