"use client";

import { useState } from "react";
import { ApiError, login } from "@/lib/api";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

export function LoginForm({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      onLogin(await login(username, password));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "نام کاربری یا رمز عبور نادرست است."
          : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
      );
      setPending(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_18px_40px_-24px_rgba(3,33,71,0.35)]"
      >
        <div className="h-1 w-12 rounded-full bg-accent" />
        <div>
          <h1 className="text-2xl font-extrabold text-navy">ورود به تخته پروژه</h1>
          <p className="mt-1 text-sm text-gray-text">برای دیدن برد، وارد حساب خود شوید.</p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">نام کاربری</span>
          <input
            autoFocus
            autoComplete="username"
            dir="ltr"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={input}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">رمز عبور</span>
          <input
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !username || !password}
          className="w-full rounded-lg bg-secondary py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "در حال ورود…" : "ورود"}
        </button>
      </form>
    </main>
  );
}
