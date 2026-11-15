"use client";

import { useState } from "react";
import { ApiError, login, signup } from "@/lib/api";

export const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

/** Same rules as the backend, checked first so the user gets a specific message. */
export function signupProblem(username: string, password: string, repeat: string) {
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) return "نام کاربری باید ۳ تا ۳۲ حرف انگلیسی، عدد یا _ باشد.";
  if (password.length < 8) return "رمز عبور باید دست‌کم ۸ کاراکتر باشد.";
  if (password !== repeat) return "تکرار رمز عبور با رمز یکسان نیست.";
  return "";
}

export function LoginForm({ onLogin }: { onLogin: (username: string) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isSignup = mode === "signup";

  const switchMode = () => {
    setMode(isSignup ? "login" : "signup");
    setError("");
    setPassword("");
    setRepeat("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = isSignup ? signupProblem(username, password, repeat) : "";
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setError("");
    try {
      onLogin(await (isSignup ? signup : login)(username, password));
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(
        status === 401
          ? "نام کاربری یا رمز عبور نادرست است."
          : status === 409
            ? "این نام کاربری قبلاً ثبت شده است."
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
          <h1 className="text-2xl font-extrabold text-navy">{isSignup ? "ساخت حساب تازه" : "ورود به تخته پروژه"}</h1>
          <p className="mt-1 text-sm text-gray-text">
            {isSignup ? "یک برد خالی برای پروژه‌تان ساخته می‌شود." : "برای دیدن برد، وارد حساب خود شوید."}
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">نام کاربری</span>
          <input
            autoFocus
            autoComplete="username"
            dir="ltr"
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={input}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">رمز عبور</span>
          <input
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            dir="ltr"
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </label>
        {isSignup && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-gray-text">تکرار رمز عبور</span>
            <input
              type="password"
              autoComplete="new-password"
              dir="ltr"
              maxLength={128}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className={input}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !username || !password || (isSignup && !repeat)}
          className="w-full rounded-lg bg-secondary py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "لطفاً صبر کنید…" : isSignup ? "ساخت حساب" : "ورود"}
        </button>
        <p className="text-center text-sm text-gray-text">
          {isSignup ? "حساب دارید؟ " : "حساب ندارید؟ "}
          <button type="button" onClick={switchMode} className="font-medium text-primary hover:underline">
            {isSignup ? "وارد شوید" : "ثبت‌نام کنید"}
          </button>
        </p>
      </form>
    </main>
  );
}
