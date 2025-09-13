#!/usr/bin/env node
// ESM script: node scripts/wordweb-build.mjs --date 2025-09-14 --theme "Blandings & Co." --answers "AUNT DAHLIA,BLANDINGS,EMSWORTH,PYKE,DRONES CLUB,JEEVES,WOOSTER"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i=0;i<args.length;i++) {
    const a = args[i];
    if (a === "--date") out.date = args[++i];
    else if (a === "--theme") out.theme = args[++i];
    else if (a === "--answers") out.answers = args[++i];
    else if (a === "--size") out.size = parseInt(args[++i], 10);
  }
  if (!out.date) throw new Error('Missing --date YYYY-MM-DD');
  if (!out.theme) throw new Error('Missing --theme "..."');
  if (!out.answers) throw new Error('Missing --answers "A,B,C"');
  out.size = out.size || 12;
  out.answers = out.answers.split(",").map(s => s.trim()).filter(Boolean);
  return out;
}

function emptyGrid(n) {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => ""));
}

function randInt(n) { return Math.floor(Math.random() * n); }

const DIRS = [
  [0,1], [1,0], [1,1], [-1,1],
  [0,-1], [-1,0], [-1,-1], [1,-1]
];

function placeWord(grid, word) {
  const n = grid.length;
  const letters = word.replace(/[^A-Z]/gi, "").toUpperCase().split("");
  if (!letters.length) return null;

  for (let attempt = 0; attempt < 300; attempt++) {
    const dir = DIRS[randInt(DIRS.length)];
    const r0 = randInt(n), c0 = randInt(n);
    const rEnd = r0 + dir[0] * (letters.length - 1);
    const cEnd = c0 + dir[1] * (letters.length - 1);
    if (rEnd < 0 || rEnd >= n || cEnd < 0 || cEnd >= n) continue;

    let ok = true;
    const coords = [];
    for (let i = 0; i < letters.length; i++) {
      const r = r0 + dir[0] * i;
      const c = c0 + dir[1] * i;
      const cell = grid[r][c];
      if (cell && cell !== letters[i]) { ok = false; break; }
      coords.push([r,c]);
    }
    if (!ok) continue;

    for (let i = 0; i < letters.length; i++) {
      const [r,c] = coords[i];
      grid[r][c] = letters[i];
    }
    return coords;
  }
  return null;
}

function fillRandom(grid) {
  const n = grid.length;
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!grid[r][c]) grid[r][c] = A[randInt(A.length)];
  }
}

function build({ date, theme, answers, size }) {
  const grid = emptyGrid(size);
  const outAnswers = [];

  const sorted = answers.slice().sort(
    (a,b) => b.replace(/[^A-Z]/gi,"").length - a.replace(/[^A-Z]/gi,"").length
  );

  for (const text of sorted) {
    const path = placeWord(grid, text);
    if (!path) {
      console.warn(`Could not place "${text}" — try larger --size or reduce answers.`);
      continue;
    }
    outAnswers.push({ text, path });
  }

  fillRandom(grid);
  const rows = grid.map(row => row.join(" "));

  return { date, theme, grid: rows, answers: outAnswers };
}

function main() {
  const args = parseArgs();
  const json = build(args);

  const outDir = path.join(__dirname, "..", "public", "content", "games", "wordweb");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${args.date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(json, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);
}
main();
