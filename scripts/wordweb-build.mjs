#!/usr/bin/env node
// scripts/wordweb-build.mjs
// Build daily Word Web puzzles with straight OR bent paths, guaranteed square grid.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { themes: "", out: "", size: 14, seed: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--themes") opts.themes = args[++i];
    else if (a === "--out") opts.out = args[++i];
    else if (a === "--size") opts.size = parseInt(args[++i], 10);
    else if (a === "--seed") opts.seed = args[++i];
  }
  if (!opts.themes || !opts.out) {
    console.error("Usage: node scripts/wordweb-build.mjs --themes <themes.tsv> --out <dir> [--size 14] [--seed YYYY-MM-DD]");
    process.exit(1);
  }
  return opts;
}

function readTSV(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n").trim();
  const lines = raw.split("\n");
  const header = lines.shift();
  const idx = {};
  header.split("\t").forEach((h, i) => (idx[h.trim().toLowerCase()] = i));
  const rows = lines.map(l => l.split("\t"));
  return rows.map(r => ({
    date: r[idx.date],
    theme: r[idx.theme],
    words: (r[idx.words] || "").split("|").map(s => s.trim()).filter(Boolean)
  }));
}

function rng(seedStr) {
  // xorshift32-ish seeded rng
  let h = 2166136261 >>> 0;
  const s = String(seedStr || "seed");
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619 >>> 0;
  return () => {
    h += 0x6D2B79F5;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIRS = [
  [1,0],[0,1],[-1,0],[0,-1],
  [1,1],[1,-1],[-1,1],[-1,-1]
];

function inBounds(x,y,N){ return x>=0 && y>=0 && x<N && y<N; }

function norm(s){ return String(s).toUpperCase().replace(/[^A-Z]/g, ""); }

function tryPlaceStraight(grid, word, rnd) {
  const N = grid.length;
  const dirs = shuffle(DIRS, rnd);
  const cells = shuffle(Array.from({length:N*N},(_,k)=>[k%N, (k/N)|0]), rnd);

  for (const [x0,y0] of cells) {
    for (const [dx,dy] of dirs) {
      let x=x0,y=y0, ok=true;
      for (let i=0;i<word.length;i++){
        if (!inBounds(x,y,N)) { ok=false; break; }
        const c = grid[y][x];
        if (c !== "." && c !== word[i]) { ok=false; break; }
        x+=dx; y+=dy;
      }
      if (!ok) continue;
      // commit
      x=x0; y=y0;
      for (let i=0;i<word.length;i++){ grid[y][x]=word[i]; x+=dx; y+=dy; }
      return true;
    }
  }
  return false;
}

// Try one- or two-bend placement (snake). We limit max turns to 2 for readability.
function tryPlaceBent(grid, word, rnd, maxTurns=2) {
  const N = grid.length;
  const startCells = shuffle(Array.from({length:N*N},(_,k)=>[k%N, (k/N)|0]), rnd);
  const dirOrder = shuffle(DIRS, rnd);

  function dfs(x, y, idx, turns, usedDir, visited) {
    if (!inBounds(x,y,N)) return false;
    const c = grid[y][x];
    if (c !== "." && c !== word[idx]) return false;

    visited.push([x,y]);
    if (idx === word.length - 1) {
      // commit
      for (const [xx,yy] of visited) grid[yy][xx] = word[visited.indexOf([xx,yy])]; // NOT reliable
      // The above line is wrong due to indexOf on arrays; do proper loop:
      for (let k=0;k<visited.length;k++){
        const [vx,vy]=visited[k];
        grid[vy][vx]=word[k];
      }
      return true;
    }

    for (const [dx,dy] of dirOrder) {
      const nx = x+dx, ny = y+dy;
      const turned = usedDir ? (usedDir[0]!==dx || usedDir[1]!==dy) : false;
      if (turned && turns >= maxTurns) continue;
      if (!inBounds(nx,ny,N)) continue;

      // Avoid revisiting same cell in this word
      if (visited.some(([vx,vy]) => vx===nx && vy===ny)) continue;

      // peek next char feasibility
      const cc = grid[ny][nx];
      const nextCh = word[idx+1];
      if (cc !== "." && cc !== nextCh) continue;

      // try
      if (dfs(nx, ny, idx+1, turns + (turned?1:0), [dx,dy], visited.slice())) return true;
    }
    return false;
  }

  for (const [sx,sy] of startCells) {
    if (dfs(sx, sy, 0, 0, null, [])) return true;
  }
  return false;
}

function fillDots(grid, rnd) {
  const N = grid.length;
  for (let y=0;y<N;y++){
    for (let x=0;x<N;x++){
      if (grid[y][x] === ".") {
        grid[y][x] = String.fromCharCode(65 + Math.floor(rnd()*26));
      }
    }
  }
}

function buildPuzzle(date, theme, rawWords, size, seedStr) {
  const rnd = rng(seedStr || date || theme);
  const N = size;
  const grid = Array.from({length:N}, ()=>Array.from({length:N}, () => "."));
  const answers = rawWords.map(norm).filter(Boolean);

  // Place longer words first to reduce clashes
  const order = shuffle(answers, rnd).sort((a,b)=>b.length-a.length);

  for (const w of order) {
    // Try straight first; if not, allow bent (up to 2 turns)
    if (w.length > N) throw new Error(`Word "${w}" longer than grid size ${N}.`);
    if (tryPlaceStraight(grid, w, rnd)) continue;
    if (tryPlaceBent(grid, w, rnd, 2)) continue;
    // give one more lax pass with maxTurns=3
    if (tryPlaceBent(grid, w, rnd, 3)) continue;
    throw new Error(`Failed to place word: ${w}`);
  }

  fillDots(grid, rnd);
  return {
    theme,
    size: N,
    grid: grid.map(r => r.join("")),
    answers
  };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

(function main(){
  const opts = parseArgs();
  const rows = readTSV(opts.themes);
  ensureDir(opts.out);

  let okCount = 0;
  for (const r of rows) {
    if (!r.date || !r.theme || !r.words?.length) {
      console.warn(`Skipping row with missing data: ${JSON.stringify(r)}`);
      continue;
    }
    try {
      const pz = buildPuzzle(r.date, r.theme, r.words, opts.size, r.date);
      const outFile = path.join(opts.out, `${r.date}.json`);
      fs.writeFileSync(outFile, JSON.stringify(pz, null, 2), "utf8");
      okCount++;
    } catch (e) {
      console.error(`❌ ${r.date} "${r.theme}": ${e.message}`);
    }
  }
  console.log(`✅ Built ${okCount} puzzles into ${opts.out}`);
})();
