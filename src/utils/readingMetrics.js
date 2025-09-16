// src/utils/readingMetrics.js
// Minimal client-side metrics you can later roll into GameStats
export function emit(event, payload) {
  try {
    const stamp = new Date().toISOString();
    const rec = { event, payload, stamp };
    const key = 'pgwai_metrics';
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    arr.push(rec);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {}
}

export function getAllMetrics() {
  try {
    return JSON.parse(localStorage.getItem('pgwai_metrics') || '[]');
  } catch { return []; }
}

export function clearMetrics() {
  localStorage.removeItem('pgwai_metrics');
}
