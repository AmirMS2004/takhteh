"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { BoardsArea, rememberBoard } from "@/components/BoardsArea";
import { Dashboard } from "@/components/Dashboard";
import { BRAND, LogoMark } from "@/components/Logo";
import { LoginForm } from "@/components/LoginForm";
import { UNAUTHORIZED_EVENT, getMe, logout, type Profile } from "@/lib/api";

type Session = { status: "loading" } | { status: "anonymous" } | { status: "user"; profile: Profile };

export default function Home() {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [chatOpen, setChatOpen] = useState(true);
  const [view, setView] = useState<"board" | "dashboard">("board");

  const loadMe = () =>
    getMe()
      .then((profile) => setSession(profile ? { status: "user", profile } : { status: "anonymous" }))
      .catch(() => setSession({ status: "anonymous" }));

  useEffect(() => {
    loadMe();
    const signOut = () => setSession({ status: "anonymous" });
    window.addEventListener(UNAUTHORIZED_EVENT, signOut);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
  }, []);

  if (session.status === "loading") return null;
  if (session.status === "anonymous") {
    return (
      <LoginForm
        onLogin={() => {
          setView("board");
          loadMe();
        }}
      />
    );
  }
  const { profile } = session;
  const dashboard = view === "dashboard";

  return (
    <main className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 mb-6 border-b border-line bg-white/85 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3 sm:px-10">
          <div className="flex items-center gap-2.5">
            <LogoMark size={36} />
            {/* The brand name is the board view's heading; the dashboard has its own. */}
            {dashboard ? (
              <span className="text-2xl font-black tracking-tight text-navy">{BRAND.name}</span>
            ) : (
              <h1 className="text-2xl font-black tracking-tight text-navy">{BRAND.name}</h1>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            {dashboard ? (
              <button
                type="button"
                onClick={() => setView("board")}
                className="rounded-lg bg-primary px-3 py-1.5 font-medium whitespace-nowrap text-white transition hover:brightness-110"
              >
                بازگشت به تخته
              </button>
            ) : (
              <button
                type="button"
                aria-pressed={chatOpen}
                onClick={() => setChatOpen((o) => !o)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
                  chatOpen
                    ? "bg-primary text-white hover:brightness-110"
                    : "bg-primary/10 text-primary hover:bg-primary/15"
                }`}
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <path d="M4 5h12v8H8l-4 3V5z" strokeLinejoin="round" />
                </svg>
                {chatOpen ? "بستن دستیار" : "دستیار هوش مصنوعی"}
              </button>
            )}
            <button
              type="button"
              title="داشبورد من"
              aria-label={`داشبورد من (${profile.username})`}
              aria-pressed={dashboard}
              onClick={() => setView("dashboard")}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-medium transition ${
                dashboard ? "bg-mist text-navy" : "text-gray-text hover:bg-mist hover:text-navy"
              }`}
            >
              <Avatar avatar={profile.avatar} username={profile.username} />
              <span dir={profile.name ? undefined : "ltr"} className="hidden sm:inline">{profile.name || profile.username}</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout().catch(() => {});
                setSession({ status: "anonymous" });
              }}
              className="rounded-lg border border-line px-3 py-1.5 font-medium text-primary transition hover:border-primary hover:bg-primary-50"
            >
              خروج
            </button>
          </div>
        </div>
      </header>
      {dashboard ? (
        <Dashboard
          profile={profile}
          onProfile={(p) => setSession({ status: "user", profile: p })}
          onOpenBoard={(id) => {
            rememberBoard(id);
            setView("board");
          }}
        />
      ) : (
        <BoardsArea username={profile.username} chatOpen={chatOpen} onOpenChat={() => setChatOpen(true)} />
      )}
    </main>
  );
}
