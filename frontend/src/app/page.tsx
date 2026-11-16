"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { BoardsArea, rememberBoard } from "@/components/BoardsArea";
import { Dashboard } from "@/components/Dashboard";
import { LogoMark } from "@/components/Logo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { LoginForm } from "@/components/LoginForm";
import { NotificationBell } from "@/components/NotificationBell";
import { UNAUTHORIZED_EVENT, getMe, logout, updateProfile, type Profile } from "@/lib/api";
import { I18nContext, applyLang, browserLang, makeI18n, useI18n, type Lang } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

type Session = { status: "loading" } | { status: "anonymous" } | { status: "user"; profile: Profile };

export default function Home() {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [chatOpen, setChatOpen] = useState(true);
  const [view, setView] = useState<"board" | "dashboard">("board");
  // The browser's last choice until the profile says otherwise.
  const [lang, setLangState] = useState<Lang>(browserLang);
  const i18n = useMemo(() => makeI18n(lang), [lang]);

  const showLang = (next: Lang) => {
    applyLang(next);
    setLangState(next);
  };
  /** The user's choice: shown at once, and saved to the profile when signed in. */
  const chooseLang = (next: Lang) => {
    showLang(next);
    if (session.status === "user") {
      setSession({ status: "user", profile: { ...session.profile, language: next } });
      updateProfile({ language: next }).catch(() => {});
    }
  };

  const loadMe = () =>
    getMe()
      .then((profile) => {
        if (profile) showLang(profile.language);
        setSession(profile ? { status: "user", profile } : { status: "anonymous" });
      })
      .catch(() => setSession({ status: "anonymous" }));

  useEffect(() => {
    loadMe();
    const signOut = () => setSession({ status: "anonymous" });
    window.addEventListener(UNAUTHORIZED_EVENT, signOut);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (session.status === "loading") return null;
  return (
    <I18nContext value={i18n}>
      {session.status === "anonymous" ? (
        <LoginForm
          onLanguage={chooseLang}
          onLogin={async (created) => {
            setView("board");
            // A new account starts in the language chosen on this page; an existing one keeps its own.
            if (created) await updateProfile({ language: lang }).catch(() => {});
            loadMe();
          }}
        />
      ) : (
        <Workspace
          profile={session.profile}
          view={view}
          chatOpen={chatOpen}
          onView={setView}
          onChat={setChatOpen}
          onLanguage={chooseLang}
          onProfile={(p) => setSession({ status: "user", profile: p })}
          onSignOut={async () => {
            await logout().catch(() => {});
            setSession({ status: "anonymous" });
          }}
        />
      )}
    </I18nContext>
  );
}

function Workspace({
  profile,
  view,
  chatOpen,
  onView,
  onChat,
  onLanguage,
  onProfile,
  onSignOut,
}: {
  profile: Profile;
  view: "board" | "dashboard";
  chatOpen: boolean;
  onView: (view: "board" | "dashboard") => void;
  onChat: (open: boolean) => void;
  onLanguage: (lang: Lang) => void;
  onProfile: (p: Profile) => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const dashboard = view === "dashboard";
  // Bumped to remount the boards area, which then opens the board remembered by rememberBoard.
  const [boardsKey, setBoardsKey] = useState(0);
  const openBoard = (id: string) => {
    rememberBoard(id);
    setBoardsKey((k) => k + 1);
    onView("board");
  };
  return (
    <main className="flex min-h-full flex-1 flex-col">
      {/* The app bar is brand navy in both themes; on-bar draws the mark inverted. */}
      <header className="on-bar sticky top-0 z-30 mb-6 border-b border-white/10 bg-bar text-white shadow-[0_8px_24px_-16px_rgba(3,33,71,0.6)]">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3 sm:px-10">
          <div className="flex items-center gap-2.5">
            <LogoMark size={36} />
            {/* The brand name is the board view's heading; the dashboard has its own. */}
            {dashboard ? (
              <span className="text-2xl font-black tracking-tight">{t("brand.name")}</span>
            ) : (
              <h1 className="text-2xl font-black tracking-tight">{t("brand.name")}</h1>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            {dashboard ? (
              <button
                type="button"
                onClick={() => onView("board")}
                className="rounded-lg bg-primary-strong px-3 py-1.5 font-medium whitespace-nowrap text-white transition hover:brightness-110"
              >
                {t("app.backToBoard")}
              </button>
            ) : (
              <button
                type="button"
                aria-pressed={chatOpen}
                onClick={() => onChat(!chatOpen)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
                  chatOpen ? "bg-primary-strong text-white hover:brightness-110" : "bg-white/10 text-white hover:bg-white/15"
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M4 5h12v8H8l-4 3V5z" strokeLinejoin="round" />
                </svg>
                {chatOpen ? t("app.closeAssistant") : t("app.assistant")}
              </button>
            )}
            <button
              type="button"
              title={t("app.dashboard")}
              aria-label={t("app.dashboardOf", { username: profile.name || profile.username })}
              aria-pressed={dashboard}
              onClick={() => onView("dashboard")}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-medium transition ${
                dashboard ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Avatar avatar={profile.avatar} username={profile.username} />
              <span dir={profile.name ? undefined : "ltr"} className="hidden sm:inline">
                {profile.name || profile.username}
              </span>
            </button>
            <NotificationBell onOpenBoard={openBoard} />
            <LanguageToggle onLanguage={onLanguage} />
            <ThemeToggle />
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-white/25 px-3 py-1.5 font-medium text-white transition hover:bg-white/10"
            >
              {t("app.logout")}
            </button>
          </div>
        </div>
      </header>
      {dashboard ? (
        <Dashboard
          profile={profile}
          onProfile={onProfile}
          onOpenBoard={openBoard}
        />
      ) : (
        <BoardsArea
          key={boardsKey}
          username={profile.username}
          chatOpen={chatOpen}
          onOpenChat={() => onChat(true)}
        />
      )}
    </main>
  );
}

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t("app.darkTheme")}
      aria-pressed={dark}
      title={dark ? t("app.lightTheme") : t("app.darkTheme")}
      onClick={toggle}
      className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
    >
      {dark ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="10" cy="10" r="3.5" />
          <path
            d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M16 12.5A6.5 6.5 0 017.5 4a6.5 6.5 0 108.5 8.5z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
