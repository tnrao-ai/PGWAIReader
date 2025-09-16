// src/utils/chapterizer.js
// Client-side helpers (mirror server logic) for defensive rendering & titles.
export function safeHTML(html) {
  // Minimal wrapper to ensure empty or malformed content doesn't crash the UI
  if (typeof html !== 'string') return '<p></p>';
  return html || '<p></p>';
}

export function titleForChapter(ch, i) {
  return ch?.title || `Section ${i + 1}`;
}
