#!/usr/bin/env node
/**
 * Build/augment the Jeeves' Jottings quiz bank from a 2-column Tab-Delimited file.
 * Input (tab-delimited with headers): public/content/games/quiz/Quiz_Questions.txt
 *   sentence<TAB>answer     (use "_____": five underscores, as the blank)
 *
 * Variant Logic (up to 2 new variants per base):
 *  1) Prefer multi-word quoted phrases/idioms (e.g., "rooted in human nature")
 *  2) Prefer Proper-Noun phrases (places / secondary characters, 2+ words first)
 *  3) Fallback to meaningful content bigrams
 *  4) Never blank core cast (Bertie, Wooster, Jeeves, Psmith, Ukridge; incl. possessives)
 *
 * Output JSON: public/content/games/quiz/questions.json
 * Each item: { id, origin, question, answer: [..], difficulty }
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const REPO = process.cwd();
const INPUT = path.join(REPO, "public", "content", "games", "quiz", "Quiz_Questions.txt");
const OUTPUT = path.join(REPO, "public", "content", "games", "quiz", "questions.json");

const BLANK = "_____";
const MAX_VARIANTS_PER_BASE = 2;
const MIN_ANS_LEN = 3;

// Denylist (lowercased)
const CORE_DENY = new Set([
  "bertie","wooster","bertie wooster","jeeves","psmith","ukridge",
  "bertie's","wooster's","jeeves's","psmith's","ukridge's","jeeves’","bertie’s"
]);

const STOPWORDS = new Set(`a an the and or but so yet for nor
of to in on at by from as with without into onto over under about after before between through during within across behind beyond near since until upon
is am are was were be been being do does did doing have has had having will would shall should can could may might must
that this these those there here it its it's he him his she her hers they them their theirs we us our ours you your yours i me my mine
not no yes if than then too very just only also ever never once again`.split(/\s+/));

function readTSV(p) {
  if (!fs.existsSync(p)) {
    console.error(`Input not found: ${p}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const lines = raw.split("\n").filter(Boolean);
  const header = lines[0].split("\t").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const iS = header.indexOf("sentence");
  const iA = header.indexOf("answer");
  if (iS === -1 || iA === -1) {
    console.error(`Header must contain columns: sentence<TAB>answer`);
    process.exit(1);
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const sentence = (cols[iS] || "").trim().replace(/^"|"$/g, "");
    const answer = (cols[iA] || "").trim().replace(/^"|"$/g, "");
    if (sentence && answer) rows.push({ sentence, answer });
  }
  return rows;
}

function idFor(text) {
  return "q_" + crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);
}
function norm(s) { return s.replace(/\s+/g, " ").trim().toLowerCase(); }

function difficulty(ans) {
  const L = ans.replace(/[^A-Za-z]/g, "").length;
  return L <= 5 ? 1 : L <= 8 ? 2 : 3;
}

function fillBlank(sentence, answer) {
  return sentence.replace(BLANK, answer).replace('""'+BLANK+'""', answer);
}

// --- parsing helpers ---
const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;
function tokensWithSpans(s) {
  const out = [];
  let m;
  while ((m = WORD_RE.exec(s)) !== null) out.push({ w: m[0], a: m.index, b: m.index + m[0].length });
  return out;
}
function isStopCandidate(w) {
  const x = w.toLowerCase();
  if (STOPWORDS.has(x)) return true;
  if (x.length < MIN_ANS_LEN) return true;
  if (/^\d+$/.test(x)) return true;
  return false;
}
function quotedPhrases(s) {
  // "…phrase…" → only if 2+ words
  const out = [];
  const rx = /"([^"]+)"/g;
  let m;
  while ((m = rx.exec(s)) !== null) {
    const txt = m[1].trim();
    if (txt.split(/\s+/).length >= 2) out.push({ txt, a: m.index + 1, b: m.index + 1 + txt.length });
  }
  return out;
}
function properNounPhrases(s) {
  // sequences of Capitalized Words (allow hyphen/’s)
  const toks = tokensWithSpans(s);
  const phrases = [];
  for (let i = 0; i < toks.length; ) {
    const { w, a } = toks[i];
    if (/^[A-Z][A-Za-z’'-]*$/.test(w)) {
      let j = i + 1;
      let end = toks[i].b;
      const words = [w];
      while (j < toks.length && /^[A-Z][A-Za-z’'-]*$/.test(toks[j].w)) {
        words.push(toks[j].w);
        end = toks[j].b;
        j++;
      }
      const txt = words.join(" ");
      if (!CORE_DENY.has(norm(txt)) && !words.every(z => STOPWORDS.has(z.toLowerCase()))) {
        phrases.push({ txt, a, b: end });
      }
      i = j;
    } else i++;
  }
  // prefer 2+ words
  phrases.sort((p, q) => (q.txt.split(" ").length - p.txt.split(" ").length) || (p.a - q.a));
  return phrases;
}
function contentBigrams(s, excludeSet) {
  const toks = tokensWithSpans(s);
  const out = [];
  for (let i = 0; i < toks.length - 1; i++) {
    const t1 = toks[i], t2 = toks[i + 1];
    if (/^[A-Z]/.test(t1.w) || /^[A-Z]/.test(t2.w)) continue;
    if (isStopCandidate(t1.w) || isStopCandidate(t2.w)) continue;
    const phrase = `${t1.w} ${t2.w}`;
    if (excludeSet.has(norm(phrase))) continue;
    out.push({ txt: phrase, a: t1.a, b: t2.b });
  }
  return out;
}
function makeVariant(full, a, b, ans) {
  return { q: full.slice(0, a) + BLANK + full.slice(b), ans };
}

function buildVariants(sentence, answer) {
  const origin = idFor(sentence);
  const base = { id: idFor(sentence + "::" + answer), origin, question: sentence, answer: [answer], difficulty: difficulty(answer) };
  const out = [base];

  const full = fillBlank(sentence, answer);
  const used = new Set([norm(answer)]);
  let made = 0;

  // 1) quoted phrases
  for (const { txt, a, b } of quotedPhrases(full)) {
    const nn = norm(txt);
    if (used.has(nn) || CORE_DENY.has(nn)) continue;
    if (txt.split(/\s+/).every(w => STOPWORDS.has(w.toLowerCase()))) continue;
    const { q, ans } = makeVariant(full, a, b, txt);
    out.push({ id: idFor(q + "::" + ans), origin, question: q, answer: [ans], difficulty: difficulty(ans) });
    used.add(nn);
    if (++made >= MAX_VARIANTS_PER_BASE) return out;
  }

  // 2) proper-noun phrases
  for (const { txt, a, b } of properNounPhrases(full)) {
    const nn = norm(txt);
    if (used.has(nn) || CORE_DENY.has(nn)) continue;
    const { q, ans } = makeVariant(full, a, b, txt);
    out.push({ id: idFor(q + "::" + ans), origin, question: q, answer: [ans], difficulty: difficulty(ans) });
    used.add(nn);
    if (++made >= MAX_VARIANTS_PER_BASE) return out;
  }

  // 3) content bigrams (fallback)
  const exclude = new Set([...used, ...CORE_DENY]);
  for (const { txt, a, b } of contentBigrams(full, exclude)) {
    const nn = norm(txt);
    if (used.has(nn)) continue;
    const { q, ans } = makeVariant(full, a, b, txt);
    out.push({ id: idFor(q + "::" + ans), origin, question: q, answer: [ans], difficulty: difficulty(ans) });
    used.add(nn);
    if (++made >= MAX_VARIANTS_PER_BASE) return out;
  }

  return out;
}

// ------------ main ------------
const rows = readTSV(INPUT);
const all = [];
for (const r of rows) all.push(...buildVariants(r.sentence, r.answer));

// global dedupe
const seen = new Set();
const deduped = [];
for (const q of all) {
  const key = JSON.stringify([norm(q.question), q.answer.map(norm)]);
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(q);
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, JSON.stringify(deduped, null, 2), "utf8");
console.log(`Wrote ${OUTPUT} (${deduped.length} questions from ${rows.length} bases)`);
