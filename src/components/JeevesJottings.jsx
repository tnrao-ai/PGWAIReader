import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { PenSquare, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

/* ---------- Seeded RNG so everyone gets same daily set without a server ---------- */
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function dateSeed() {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth()+1, day = d.getDate();
  return parseInt(`${y}${String(m).padStart(2,"0")}${String(day).padStart(2,"0")}`, 10);
}
function shuffleDet(arr, seed) {
  const rng = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Fuzzy match (levenshtein) ---------- */
function lev(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const dp = Array.from({length: a.length+1}, () => Array(b.length+1).fill(0));
  for (let i=0;i<=a.length;i++) dp[i][0] = i;
  for (let j=0;j<=b.length;j++) dp[0][j] = j;
  for (let i=1;i<=a.length;i++)
    for (let j=1;j<=b.length;j++)
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
      );
  return dp[a.length][b.length];
}
function isCorrect(user, answers) {
  const u = user.trim().toLowerCase();
  if (!u) return false;
  return (answers || []).some(ans => {
    const a = ans.trim().toLowerCase();
    return u === a || lev(u, a) <= 2;
  });
}

export default function JeevesJottings() {
  const [allQ, setAllQ] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const seed = useMemo(() => dateSeed(), []);
  const [answers, setAnswers] = useState({}); // id -> user input
  const [checked, setChecked] = useState({}); // id -> boolean

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const base = import.meta.env.BASE_URL || "/";
        const resp = await fetch(`${base}content/games/quiz/questions.json`, { cache: "no-cache" });
        if (!resp.ok) throw new Error("Failed to load quiz bank.");
        const data = await resp.json();
        setAllQ(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e?.message || "Failed to load quiz.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const todays = useMemo(() => {
    const picked = shuffleDet(allQ, seed).slice(0, 10);
    return picked;
  }, [allQ, seed]);

  const score = useMemo(() => {
    let s = 0;
    todays.forEach(q => {
      const u = answers[q.id] || "";
      if (isCorrect(u, q.answer)) s++;
    });
    return s;
  }, [todays, answers]);

  const badge = score === 10 ? "🥇 Jeeves-level brilliance!"
              : score >= 8 ? "🥈 Top-notch, old bean!"
              : score >= 5 ? "🥉 Jolly good show!"
              : score > 0  ? "🍰 A slice of effort!"
              : "🙂 Have a bash — unlimited attempts!";

  const markAll = () => {
    const next = {};
    todays.forEach(q => { next[q.id] = true; });
    setChecked(next);
  };

  const resetAll = () => {
    setAnswers({});
    setChecked({});
  };

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 250, damping: 14 }}>
            <PenSquare className="w-6 h-6 text-blue-600" />
          </motion.div>
          <h2 className="text-lg font-bold">Jeeves’ Jottings — Daily Quiz</h2>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">10 questions · unlimited attempts</div>
      </div>

      {loading && <div>Loading quiz…</div>}
      {err && <div className="text-red-600">{err}</div>}
      {!loading && !err && todays.length === 0 && <div>No questions available.</div>}

      <div className="space-y-4">
        {todays.map((q, idx) => {
          const user = answers[q.id] || "";
          const correct = isCorrect(user, q.answer);
          const wasChecked = !!checked[q.id];

          return (
            <motion.div
              key={q.id}
              className="p-4 rounded-lg border bg-gray-50 dark:bg-gray-900 dark:border-gray-700"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-2"><span className="font-semibold">Q{idx+1}.</span> {q.question}</div>
              <div className="flex items-center gap-2">
                <input
                  value={user}
                  onChange={(e) => setAnswers(prev => ({...prev, [q.id]: e.target.value}))}
                  className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700"
                  placeholder="Type your answer"
                />
                {(wasChecked || user) && (
                  correct
                    ? <CheckCircle2 className="w-5 h-5 text-green-600" aria-label="Correct" />
                    : <XCircle className="w-5 h-5 text-red-600" aria-label="Incorrect" />
                )}
              </div>
              <div className="mt-2 text-sm">
                {(wasChecked || user) && (
                  correct
                    ? <span className="text-green-700">✅ Correct!</span>
                    : <span className="text-red-700">❌ Not quite — try again.</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-base font-semibold">Score: {score}/10 — {badge}</div>
        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-2"
            onClick={markAll}
          >
            <CheckCircle2 className="w-4 h-4" /> Check Answers
          </button>
          <button
            className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-2"
            onClick={resetAll}
          >
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
        </div>
      </div>
    </section>
  );
}
