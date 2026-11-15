"use client";

import { useState } from "react";
import { ApiError, changePassword } from "@/lib/api";
import { input } from "./LoginForm";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("رمز تازه باید دست‌کم ۸ کاراکتر باشد.");
    if (next !== repeat) return setError("تکرار رمز تازه با آن یکسان نیست.");
    setPending(true);
    setError("");
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "رمز فعلی نادرست است."
          : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy/30 px-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-[0_18px_40px_-16px_rgba(3,33,71,0.45)]"
      >
        <h2 id="change-password-title" className="text-lg font-bold text-navy">
          تغییر رمز عبور
        </h2>
        {done ? (
          <>
            <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              رمز عبور تغییر کرد.
            </p>
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="w-full rounded-lg bg-secondary py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              بستن
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {(
              [
                ["رمز فعلی", current, setCurrent, "current-password"],
                ["رمز تازه", next, setNext, "new-password"],
                ["تکرار رمز تازه", repeat, setRepeat, "new-password"],
              ] as const
            ).map(([label, value, set, autoComplete], i) => (
              <label key={label} className="block space-y-1.5">
                <span className="text-sm font-medium text-gray-text">{label}</span>
                <input
                  type="password"
                  autoFocus={i === 0}
                  autoComplete={autoComplete}
                  dir="ltr"
                  maxLength={128}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className={input}
                />
              </label>
            ))}
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={pending || !current || !next || !repeat}
                className="flex-1 rounded-lg bg-secondary py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "لطفاً صبر کنید…" : "ذخیره رمز تازه"}
              </button>
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm text-gray-text hover:bg-slate-100">
                انصراف
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
