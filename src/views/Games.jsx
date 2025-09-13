import React, { useEffect, useMemo, useState } from "react";
import WoostersWordWeb from "../components/WoostersWordWeb.jsx";
import JeevesJottings from "../components/JeevesJottings.jsx";
import StatsPanel from "../components/StatsPanel.jsx";

const GamesLegal = () => (
  <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
    <h2 className="text-lg font-bold mb-3">Legal Disclaimer</h2>
    <p className="text-sm text-gray-700 dark:text-gray-300">
      All puzzles and quizzes on this site — including <em>Wooster’s Word Web</em> and <em>Jeeves’ Jottings</em> — are
      constructed from the public-domain works of P. G. Wodehouse, made freely available thanks to{" "}
      <a href="https://www.gutenberg.org/" target="_blank" rel="noreferrer" className="underline">Project Gutenberg</a>.
      This section is intended for literary fun and wordplay, and is not affiliated with nor derived from any commercial
      puzzle providers.
    </p>
  </section>
);

export default function Games() {
  const tabs = ["Wooster’s Word Web", "Jeeves’ Jottings", "Dictionary Stats", "Legal"];
  const [tab, setTab] = useState(tabs[0]);

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg border ${tab === t ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Wooster’s Word Web" && <WoostersWordWeb />}
      {tab === "Jeeves’ Jottings" && <JeevesJottings />}
      {tab === "Dictionary Stats" && <StatsPanel />}
      {tab === "Legal" && <GamesLegal />}
    </div>
  );
}
