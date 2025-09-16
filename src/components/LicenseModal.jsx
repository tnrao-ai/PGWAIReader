// src/components/LicenseModal.jsx
import React from 'react';

export default function LicenseModal({ open, onClose, license }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl max-w-2xl w-full p-6">
        <h2 className="text-xl font-semibold mb-3">About & License</h2>
        <p className="text-sm opacity-80 mb-4">
          {license?.sentence || 'Project Gutenberg eBook license applies.'}
        </p>
        <div className="flex gap-4">
          {license?.termsUrl && (
            <a className="underline" href={license.termsUrl} target="_blank" rel="noreferrer">
              Full License
            </a>
          )}
          {license?.landing && (
            <a className="underline" href={license.landing} target="_blank" rel="noreferrer">
              Book Landing Page
            </a>
          )}
        </div>
        <button className="mt-6 px-4 py-2 rounded-xl bg-neutral-800 text-white" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
