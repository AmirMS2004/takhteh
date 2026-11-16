"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A native modal dialog: the browser moves focus into it, keeps it there, makes the page behind it inert
 * and returns focus when it closes. Escape or a click on the dimmed backdrop calls `onClose`.
 */
export function Modal({
  title,
  hint,
  narrow = false,
  onClose,
  children,
}: {
  title: string;
  hint?: string;
  narrow?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The dialog element itself is only hit outside its content box, on the backdrop.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={`m-auto w-[calc(100%-3rem)] ${narrow ? "max-w-sm" : "max-w-md"} rounded-2xl bg-surface p-0 text-ink shadow-[0_18px_40px_-16px_rgba(3,33,71,0.45)] backdrop:bg-navy/30`}
    >
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-accent" />
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {title}
            </h2>
          </div>
          {hint && <p className="mt-1 text-xs text-gray-text">{hint}</p>}
        </div>
        {children}
      </div>
    </dialog>
  );
}
