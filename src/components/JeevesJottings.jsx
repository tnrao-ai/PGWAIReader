import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, RefreshCw, CheckCircle2, XCircle, HelpCircle, Eye } from "lucide-react";
import { centralDateStr, pickDailyQuiz, loadPersisted, persistDaily } from "../utils/dailyPicker";

/**
 * Jeeves' Jottings — Daily Quiz (10 Qs)
 * - Pulls from public/content/games/quiz/questions.json
 * - Deterministic daily pick (America/Chicago), max 1 item per origin
 * - Unlimited attempts; immediate per-item feedback after "Check answers"
 * - Persists the day's picked Qs so refresh doesn't reshuffle mid-day
 */

function normalizeAnswer(s = "") {
  return (s || "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^A-Za-z0-9'"\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isCorrect(userText, correctArr) {
  const u = normalizeAnswer(userText);
  return (correctArr || []).some(ans => normalizeAnswer(ans) === u);
}

export default function JeevesJottings() {
  const [seed] = useState(centralDateStr());
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]); // picked 10 for the day
  const [answers, setAnswers] = useState({});     // id -> string
  const [checked, setChecked] = useState(false);  // show correctness
  const [showAll, setShowAll] = useState(false);  // NEW: reveal all answers
  const [error, setError] = useState("");

  // Load / pick daily
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");

      const persisted = loadPersisted(seed);
      if (persisted && Array.isArray(persisted) && persisted.length > 0) {
        if (!cancelled) {
          setQuestions(persisted);
          setLoading(false);
        }
        return;
      }

      try {
        const base = import.meta.env.BASE_URL || "/";
        const resp = await fetch(`${base}content/games/quiz/questions.json`, { cache: "no-cache" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const all = await resp.json();
        const picked = pickDailyQuiz(all, 10, seed);
        if (!cancelled) {
          setQuestions(picked);
          persistDaily(picked, seed);
        }
      } catch (e) {
        if (!cancelled) setError("Unable to load the quiz questions. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seed]);

  // Map of correctness (after check)
  const correctness = useMemo(() => {
    if (!checked) return {};
    const out = {};
    for (const q of questions) {
      out[q.id] = isCorrect(answers[q.id] || "", q.answer);
    }
    return out;
  }, [checked, answers, questions]);

  const total = questions.length;
  const correctCount = Object.values(correctness).filter(Boolean).length;
  const allCorrect = checked && total > 0 && correctCount === total;

  const onInput = (id, value) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const onCheck = () => setChecked(true);

  const onTryAgain = () => {
    if (!checked) return;
    const next = { ...answers };
    for (const q of questions) {
      if (!correctness[q.id]) next[q.id] = "";
    }
    setAnswers(next);
    setChecked(false);
  };

  const onResetDay = () => {
    localStorage.removeItem(`jj_daily_${seed}`);
    location.reload();
  };

  const onRevealAll = () => {
    setShowAll(true);
    setChecked(true); // optional: ensures correctness icons show where applicable
  };

  // Skeleton / Loading
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
          <div className="h-4 w-2/3 bg-gray-200 rounded" />
          <div className="h-4 w-5/6 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
          {error}
        </div>
        <button
          className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
          onClick={() => location.reload()}
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      {/* Title */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-serif font-bold">Jeeves’ Jottings — Daily Quiz</h1>
          <p className="text-sm text-gray-600">Date: {seed} (America/Chicago)</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
            onClick={onResetDay}
            title="Re-roll today's set (debug)"
          >
            <RefreshCw className="w-4 h-4" /> New set
          </button>
        </div>
      </div>

      {/* Explainer */}
      <div className="mb-6 p-3 sm:p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-3">
        <HelpCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="text-sm leading-relaxed">
          Type the missing word(s) for each sentence. You can try as many times as you like.
          Click <b>Reveal answers</b> if you want to see every correct answer immediately.
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-5">
        {questions.map((q, idx) => {
          const answered = answers[q.id] ?? "";
          const isOk = correctness[q.id] === true;
          const isWrong = checked && !isOk;
          const labelId = `q-${idx}`;
          const parts = q.question.split("_____");

          return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-lg border p-4 ${isOk ? "border-emerald-300 bg-emerald-50" : isWrong ? "border-rose-300 bg-rose-50" : "border-gray-200 bg-white"}`}
            >
              <div className="text-sm text-gray-500 mb-1">Q{idx + 1}</div>

              {/* Sentence with blank */}
              <div className="text-[15px] sm:text-base leading-relaxed mb-3">
                {parts.map((chunk, i) => (
                  <React.Fragment key={i}>
                    {chunk}
                    {i < parts.length - 1 && (
                      <span className="px-2 py-0.5 mx-1 rounded bg-yellow-100 text-yellow-800 whitespace-nowrap">_____</span>
                    )}
                  </React.Fragment>
                ))}
              </div>

              <label htmlFor={labelId} className="sr-only">Your answer</label>
              <div className="flex items-center gap-2">
                <input
                  id={labelId}
                  type="text"
                  value={answered}
                  onChange={(e) => onInput(q.id, e.target.value)}
                  placeholder="Type your answer"
                  className={`w-full rounded-md border px-3 py-2 outline-none transition
                    ${isOk ? "border-emerald-400 bg-emerald-50" : isWrong ? "border-rose-400 bg-rose-50" : "border-gray-300 bg-white focus:border-blue-400"}`}
                />
                <AnimatePresence initial={false} mode="popLayout">
                  {checked && isOk && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="text-emerald-600"
                      title="Correct"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </motion.div>
                  )}
                  {checked && isWrong && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="text-rose-600"
                      title="Try again"
                    >
                      <XCircle className="w-5 h-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Show correct answer:
                  - when user gets it right (as before), OR
                  - when "Reveal answers" is active (NEW)
              */}
              {(checked && isOk) || showAll ? (
                <div className="mt-2 text-sm text-emerald-700">
                  Correct answer: <b>{q.answer[0]}</b>
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </div>

      {/* Footer buttons */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={onCheck}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Check answers
        </button>

        <button
          onClick={onTryAgain}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
          disabled={!checked}
          title={!checked ? "Check answers first" : "Clear the incorrect ones and retry"}
        >
          Try again
        </button>

        <button
          onClick={onRevealAll}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-100 hover:bg-emerald-200"
          title="Reveal all correct answers"
        >
          <Eye className="w-5 h-5" /> Reveal answers
        </button>

        {allCorrect && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="ml-auto flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg"
          >
            <Trophy className="w-5 h-5" />
            <span className="font-semibold">Splendid! A perfect score today.</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
