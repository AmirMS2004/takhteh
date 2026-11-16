"use client";

import { useState } from "react";
import { ApiError, changePassword } from "@/lib/api";
import { useI18n, type Key } from "@/lib/i18n";
import { input } from "./LoginForm";
import { Modal } from "./Modal";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<Key | "">("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError("pw.newRule");
    if (next !== repeat) return setError("pw.mismatch");
    setPending(true);
    setError("");
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "pw.wrongCurrent"
          : "common.network",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal title={t("pw.title")} narrow onClose={onClose}>
      {done ? (
        <>
          <p
            role="status"
            className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-700"
          >
            {t("pw.done")}
          </p>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="w-full rounded-lg bg-secondary py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            {t("common.close")}
          </button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {(
            [
              [t("pw.current"), current, setCurrent, "current-password"],
              [t("pw.new"), next, setNext, "new-password"],
              [t("pw.repeat"), repeat, setRepeat, "new-password"],
            ] as const
          ).map(([label, value, set, autoComplete], i) => (
            <label key={label} className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-text">
                {label}
              </span>
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
            <p
              role="alert"
              className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger"
            >
              {t(error)}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending || !current || !next || !repeat}
              className="flex-1 rounded-lg bg-secondary py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? t("common.wait") : t("pw.save")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm text-gray-text hover:bg-mist"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
