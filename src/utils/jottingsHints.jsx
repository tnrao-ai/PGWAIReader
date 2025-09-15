// src/utils/jottingsHints.js
// Local, deterministic, spoiler-safe hint generator for Jeeves Jottings

const VOWELS = new Set(["A","E","I","O","U"]);
const ALPHA = /[A-Z]/;

function normalize(s) {
  return String(s || "").toUpperCase();
}

function simpleHash(str) {
  // small, stable hash for style selection (no crypto)
  let h = 2166136261 >>> 0;
  const s = normalize(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickStyle(answer, seed = "") {
  // Use both the answer and an optional daily seed (e.g., YYYY-MM-DD) so hints can vary by day
  const h = simpleHash(`${seed}|${answer}`);
  const styles = ["MASK_ANCHOR", "VC_PATTERN", "JUMBLE_DECOY", "ENDING_LEN", "ACROSTIC"];
  return styles[h % styles.length];
}

function maskAnchor(answer) {
  // Keep non-letters (spaces, hyphens) as-is. Reveal first and one inner anchor.
  const A = normalize(answer);
  const chars = A.split("");
  const letterIdx = chars.map((c, i) => (ALPHA.test(c) ? i : -1)).filter(i => i >= 0);
  if (letterIdx.length === 0) return "—";
  const first = letterIdx[0];
  const mid = letterIdx.length > 2 ? letterIdx[Math.floor(letterIdx.length / 2)] : letterIdx[letterIdx.length - 1];

  return chars
    .map((c, i) => {
      if (!ALPHA.test(c)) return c;                          // keep spaces/hyphens
      if (i === first || i === mid) return c;                // reveal anchor(s)
      return "_";
    })
    .join(" ");
}

function vcPattern(answer) {
  const A = normalize(answer);
  return A.split("")
    .map(c => {
      if (!ALPHA.test(c)) return c;              // keep spaces/hyphens
      return VOWELS.has(c) ? "V" : "C";
    })
    .join("");
}

function jumbleWithDecoys(answer) {
  // Shuffle letters of the normalized answer and add 1–2 deterministic decoys
  const A = normalize(answer).replace(/[^A-Z]/g, "");
  if (!A) return "—";
  const pool = A.split("");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const decoys = Math.max(1, Math.min(2, Math.floor(A.length / 5)));
  for (let i = 0; i < decoys; i++) {
    pool.push(alphabet[(A.length * 7 + i * 11) % 26]);
  }
  // Deterministic shuffle:
  const arr = pool.slice();
  let h = simpleHash(A);
  for (let i = arr.length - 1; i > 0; i--) {
    // xorshift-ish
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return `${arr.join(" · ")}  (contains exactly ${A.length} letters of the answer)`;
}

function endingLen(answer) {
  const A = normalize(answer).replace(/[^A-Z]/g, "");
  if (!A) return "—";
  const tail = A.slice(-2);
  return `Ends with “${tail}”, total length ${A.length}.`;
}

function acrostic(answer) {
  // Build a short sentence whose word initials spell the answer.
  // Neutral filler words mapped by letter classes keep it fair.
  const A = normalize(answer).replace(/[^A-Z]/g, "");
  if (!A) return "—";
  const bank = {
    V: ["Amiable", "Eager", "Ideal", "Open", "Unique"], // fallback vowel-first words
    C: ["Bertie", "Jolly", "Quick", "Witty", "Brisk", "Grand", "Plucky", "Noble"], // consonant-first
  };
  const words = [];
  for (const ch of A) {
    const bucket = VOWELS.has(ch) ? bank.V : bank.C;
    // pick the first that starts with the same letter, else synthesize
    let w = bucket.find(wd => wd[0] === ch);
    if (!w) {
      // Fallback: ch + generic ending
      const tail = VOWELS.has(ch) ? "musing" : "marvel";
      w = ch + tail;
    }
    words.push(w);
  }
  const sentence = words.join(" ");
  return `${sentence}. (Initials form the answer)`;
}

export function buildHint(answer, options = {}) {
  const { dailySeed = "" } = options;
  const style = pickStyle(answer, dailySeed);
  switch (style) {
    case "MASK_ANCHOR":
      return maskAnchor(answer);
    case "VC_PATTERN":
      return vcPattern(answer);
    case "JUMBLE_DECOY":
      return jumbleWithDecoys(answer);
    case "ENDING_LEN":
      return endingLen(answer);
    case "ACROSTIC":
    default:
      return acrostic(answer);
  }
}

/**
 * Create hints for an array of questions:
 * questions: [{ id, prompt/question, answer: [ ...acceptedStrings ] }]
 * returns: [{ id, hint }]
 */
export function buildHintsForQuiz(questions, dailySeed = "") {
  return (questions || []).map(q => ({
    id: q.id ?? q.question ?? String(Math.random()),
    hint: buildHint((q.answer && q.answer[0]) || "", { dailySeed }),
  }));
}
