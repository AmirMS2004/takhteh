"use client";

import type { ReactNode } from "react";

/** A centered dialog over a dimmed page; closes on Escape or a click outside. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy/30 px-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_18px_40px_-16px_rgba(3,33,71,0.45)]"
      >
        <h2 className="text-lg font-bold text-navy">{title}</h2>
        {children}
      </div>
    </div>
  );
}
