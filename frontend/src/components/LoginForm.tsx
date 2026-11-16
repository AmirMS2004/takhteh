"use client";

import { useState } from "react";
import { LanguageToggle } from "./LanguageToggle";
import { LogoMark } from "./Logo";
import { ApiError, login, signup } from "@/lib/api";
import { useI18n, type Key, type Lang } from "@/lib/i18n";

export const input =
  "w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

/** Same rules as the backend, checked first so the user gets a specific message (a dictionary key). */
export function signupProblem(username: string, password: string, repeat: string): Key | "" {
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) return "auth.usernameRule";
  if (password.length < 8) return "auth.passwordRule";
  if (password !== repeat) return "auth.repeatMismatch";
  return "";
}

/** `onLogin(created)`: signed in, with a new account when `created`. */
export function LoginForm({ onLogin, onLanguage }: { onLogin: (created: boolean) => void; onLanguage: (lang: Lang) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<Key | "">("");
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
      await (isSignup ? signup : login)(username, password);
      onLogin(isSignup);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 401 ? "auth.wrong" : status === 409 ? "auth.taken" : "common.network");
      setPending(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-8 shadow-[0_18px_40px_-24px_rgba(3,33,71,0.35)]"
      >
        {/* Brand band: navy with the inverted mark, like the app bar. */}
        <div className="on-bar -mx-8 -mt-8 mb-6 flex items-center gap-3 rounded-t-2xl bg-bar px-8 py-6 text-white">
          <LogoMark size={48} />
          <div>
            <p className="text-2xl leading-none font-black tracking-tight">{t("brand.name")}</p>
            <p className="mt-1.5 text-xs text-white/70">{t("brand.tagline")}</p>
          </div>
          <div className="ms-auto flex items-center gap-3">
            <LanguageToggle onLanguage={onLanguage} />
            <span className="h-10 w-1 rounded-full bg-accent" />
          </div>
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-ink">{isSignup ? t("auth.signupTitle") : t("auth.loginTitle")}</h1>
          <p className="mt-1 text-sm text-gray-text">{isSignup ? t("auth.signupHint") : t("auth.loginHint")}</p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">{t("common.username")}</span>
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
          <span className="text-sm font-medium text-gray-text">{t("common.password")}</span>
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
            <span className="text-sm font-medium text-gray-text">{t("auth.repeatPassword")}</span>
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
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">
            {t(error)}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || !username || !password || (isSignup && !repeat)}
          className="w-full rounded-lg bg-secondary py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? t("common.wait") : isSignup ? t("auth.createAccount") : t("auth.login")}
        </button>
        <p className="text-center text-sm text-gray-text">
          {isSignup ? t("auth.haveAccount") : t("auth.noAccount")}
          <button type="button" onClick={switchMode} className="font-medium text-primary hover:underline">
            {isSignup ? t("auth.toLogin") : t("auth.toSignup")}
          </button>
        </p>
      </form>
    </main>
  );
}
