// src/utils/indexedDb.js
import { openDB } from 'idb';

const DB_NAME = 'pgwaireader';
const DB_VERSION = 1;

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('search')) {
        db.createObjectStore('search'); // key: bookId, value: { text }
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress'); // key: bookId, value: { chapterIndex, offset }
      }
    }
  });
}

export async function putSearchText(bookId, text) {
  const db = await getDB();
  await db.put('search', { text }, String(bookId));
}

export async function getSearchText(bookId) {
  const db = await getDB();
  const rec = await db.get('search', String(bookId));
  return rec?.text || '';
}

export async function saveProgress(bookId, chapterIndex, offset) {
  const db = await getDB();
  await db.put('progress', { chapterIndex, offset }, String(bookId));
}

export async function loadProgress(bookId) {
  const db = await getDB();
  const rec = await db.get('progress', String(bookId));
  return rec || { chapterIndex: 0, offset: 0 };
}
