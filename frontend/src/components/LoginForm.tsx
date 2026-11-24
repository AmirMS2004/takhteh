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
    // The page is the تخته mark at full size: a navy board with three columns. The first holds the name and
    // three cards about the app, the middle one the form as the card in progress (the yellow card of the
    // mark), the last one an empty card. Below lg only the name and the form are shown.
    <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
      <div className="on-bar relative w-full max-w-md rounded-[2rem] bg-bar p-5 ring-1 ring-white/10 shadow-[0_30px_60px_-30px_rgba(3,33,71,0.7)] sm:p-8 lg:min-h-[34rem] lg:max-w-5xl dark:ring-line">
        <div className="absolute end-4 top-4 sm:end-6 sm:top-6">
          <LanguageToggle onLanguage={onLanguage} />
        </div>
        <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
          <div className="space-y-6">
            <div className="flex items-center gap-3 pe-14 text-white lg:pe-0">
              <LogoMark size={48} />
              <div>
                <p className="text-3xl leading-none font-black tracking-tight">{t("brand.name")}</p>
                <p className="mt-2 text-sm text-white/75">{t("brand.tagline")}</p>
              </div>
            </div>
            <ul className="hidden space-y-3 lg:block">
              <AboutCard title={t("auth.aboutDrag")}>
                <span className="h-1.5 w-8 rounded-full bg-label-green" />
                <span className="h-1.5 w-8 rounded-full bg-primary" />
              </AboutCard>
              <AboutCard title={t("auth.aboutAssistant")}>
                <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-medium text-accent-700">
                  {t("history.viaAssistant")}
                </span>
              </AboutCard>
              <AboutCard title={t("auth.aboutNotify")}>
                <span className="flex items-center gap-1 text-[11px] font-medium text-gray-text">
                  <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-navy text-[10px] font-bold text-white">
                    {t("auth.you").slice(0, 1)}
                  </span>
                  {t("auth.you")}
                </span>
              </AboutCard>
              <li aria-hidden className="h-14 rounded-xl bg-white/12" />
            </ul>
          </div>
          <div className="space-y-3">
            <form
              onSubmit={submit}
              className="motion-safe:animate-[settle_250ms_ease-out] overflow-hidden rounded-2xl bg-surface shadow-[0_18px_40px_-20px_rgba(3,33,71,0.6)]"
            >
              {/* The yellow edge: this card is the work in progress. */}
              <div className="h-1.5 bg-accent" />
              <div className="space-y-4 p-6 sm:p-7">
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
                <button type="button" onClick={switchMode} className="font-medium text-primary-700 hover:underline">
                  {isSignup ? t("auth.toLogin") : t("auth.toSignup")}
                </button>
              </p>
              </div>
            </form>
            <div aria-hidden className="hidden h-14 rounded-xl bg-white/12 lg:block" />
          </div>
          <div aria-hidden className="hidden pt-[4.5rem] lg:block">
            <div className="h-10 rounded-xl bg-white/12" />
          </div>
        </div>
      </div>
    </main>
  );
}

/** A card about the app, drawn like a card on a board: a title and a row of details. */
function AboutCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-xl bg-surface p-4">
      <p className="text-[15px] leading-6 font-semibold text-ink">{title}</p>
      <div className="mt-2.5 flex items-center gap-1.5">{children}</div>
    </li>
  );
}
