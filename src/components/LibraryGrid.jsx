// src/components/LibraryGrid.jsx
import React from 'react';
import { Link } from 'react-router-dom';

export default function LibraryGrid({ books }) {
  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
      {books.map(b => (
        <Link key={b.id} to={`/reader/${b.gutenbergId}`} state={{ title: b.title }}>
          <div className="rounded-2xl overflow-hidden shadow hover:shadow-lg transition">
            <img
              src={b.coverUrl}
              alt={b.title}
              className="aspect-[3/4] object-cover w-full"
              loading="lazy"
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
