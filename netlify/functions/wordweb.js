// netlify/functions/wordweb.js  (CommonJS for maximum compatibility)
const fs = require("fs");
const path = require("path");

/* ---------- tiny seeded RNG ---------- */
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

/* ---------- normalize & parse ---------- */
function normalizeWord(w) {
  return String(w || "").toUpperCase().replace(/[^A-Z]/g, "");
}

function tryReadFile(candidates) {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    } catch {}
  }
  return null;
}

function loadWordList() {
  // Try multiple paths so this works locally and on Netlify
  const cwd = process.cwd();
  const taskRoot = process.env.LAMBDA_TASK_ROOT || process.env.NETLIFY || cwd;
  const here = __dirname;

  const candidates = [
    path.resolve(cwd, "public/content/games/wordweb/words.txt"),
    path.resolve(here, "public/content/games/wordweb/words.txt"),
    path.resolve(here, "../public/content/games/wordweb/words.txt"),
    path.resolve(here, "../../public/content/games/wordweb/words.txt"),
    path.resolve(taskRoot, "public/content/games/wordweb/words.txt"),
  ];

  const raw = tryReadFile(candidates);
  if (!raw) {
    throw new Error("words.txt not found. Ensure it exists at public/content/games/wordweb/words.txt and is bundled.");
  }

  const words = raw
    .split(/\r?\n|\t|,/g)
    .map(normalizeWord)
    .filter(Boolean)
    .filter((w) => w.length >= 4 && w.length <= 12);

  const uniq = Array.from(new Set(words));
  if (uniq.length < 6) throw new Error(`Not enough eligible words (need >= 6). Found: ${uniq.length}.`);
  return uniq;
}

/* ---------- placement ---------- */
const DIRS = [
  { dx: 1, dy: 0, type: "H" },   { dx: -1, dy: 0, type: "H" },
  { dx: 0, dy: 1, type: "V" },   { dx: 0, dy: -1, type: "V" },
  { dx: 1, dy: 1, type: "D" },   { dx: -1, dy: -1, type: "D" },
  { dx: 1, dy: -1, type: "D" },  { dx: -1, dy: 1, type: "D" },
];

function canPlace(grid, N, word, x, y, dx, dy) {
  for (let i = 0; i < word.length; i++) {
    const xx = x + dx * i;
    const yy = y + dy * i;
    if (xx < 0 || yy < 0 || xx >= N || yy >= N) return false;
    if (grid[yy][xx] !== null) return false;
  }
  return true;
}

function placeWord(grid, N, word, rand, desiredType = null, maxTries = 800) {
  const directions = desiredType ? DIRS.filter(d => d.type === desiredType) : DIRS.slice();
  for (let t = 0; t < maxTries; t++) {
    const dir = directions[Math.floor(rand() * directions.length)];
    const x = Math.floor(rand() * N);
    const y = Math.floor(rand() * N);
    if (!canPlace(grid, N, word, x, y, dir.dx, dir.dy)) continue;
    for (let i = 0; i < word.length; i++) {
      const xx = x + dir.dx * i;
      const yy = y + dir.dy * i;
      grid[yy][xx] = word[i];
    }
    return dir.type;
  }
  return null;
}

function tryGenerate(dateStr, allWords, attemptSalt = 0) {
  const N = 12;
  const seedFrom = xmur3(`${dateStr}|${allWords.length}|${attemptSalt}`)();
  const rand = mulberry32(seedFrom);

  const pool = seededShuffle(allWords, rand);
  const pick = [];
  for (let i = 0; i < pool.length && pick.length < 6; i++) {
    const w = pool[i];
    if (!pick.includes(w)) pick.push(w);
  }
  if (pick.length !== 6) return null;

  const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => null));
  const targetTypes = ["H", "V", "D"];

  for (let k = 0; k < 3; k++) {
    const desired = targetTypes[k];
    const placedType = placeWord(grid, N, pick[k], rand, desired);
    if (!placedType) {
      const anyType = placeWord(grid, N, pick[k], rand, null);
      if (!anyType) return null;
    }
  }
  for (let k = 3; k < pick.length; k++) {
    const anyType = placeWord(grid, N, pick[k], rand, null);
    if (!anyType) return null;
  }

  const randLetter = () => String.fromCharCode(65 + Math.floor(rand() * 26));
  const rows = grid.map(row => row.map(ch => (ch === null ? randLetter() : ch)).join(""));

  return { theme: "Wodehouse Sampler", size: N, grid: rows, answers: pick };
}

function generatePuzzleForDate(dateStr, allWords) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const p = tryGenerate(dateStr, allWords, attempt);
    if (p && p.answers && p.answers.length === 6) return p;
  }
  throw new Error("Unable to place 6 words after multiple attempts—check very long words or reduce density.");
}

/* ---------- Netlify bundling hint ---------- */
exports.config = {
  includedFiles: ["public/content/games/wordweb/words.txt"],
};

/* ---------- Handler ---------- */
exports.handler = async (event) => {
  try {
    // Accept ?date=YYYY-MM-DD (America/Chicago); default to today's Central date
    const qs = event.queryStringParameters || {};
    let date = qs.date;
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(err && err.message ? err.message : err) }),
    };
  }
};
