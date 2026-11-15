"use client";

import { useEffect, useState } from "react";
import { Board } from "@/components/Board";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { ChatSidebar } from "@/components/ChatSidebar";
import { LoginForm } from "@/components/LoginForm";
import { UNAUTHORIZED_EVENT, getMe, logout } from "@/lib/api";
import { useBoard } from "@/lib/useBoard";

type Session = { status: "loading" } | { status: "anonymous" } | { status: "user"; username: string };

/** The board and the AI chat share one board store, so AI changes show up on the board immediately. */
function Workspace({ chatOpen }: { chatOpen: boolean }) {
  const store = useBoard();
  return (
    <div className="flex flex-1 flex-col gap-6 pb-8 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Board store={store} />
      </div>
      {/* Hidden rather than unmounted, so the conversation survives closing the panel. */}
      <div hidden={!chatOpen} className="px-6 sm:px-10 lg:pr-0 lg:pl-6">
        <ChatSidebar onBoard={store.apply} />
      </div>
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [chatOpen, setChatOpen] = useState(true);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    getMe()
      .then((username) => setSession(username ? { status: "user", username } : { status: "anonymous" }))
      .catch(() => setSession({ status: "anonymous" }));
    const signOut = () => setSession({ status: "anonymous" });
    window.addEventListener(UNAUTHORIZED_EVENT, signOut);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
  }, []);

  if (session.status === "loading") return null;
  if (session.status === "anonymous") {
    return <LoginForm onLogin={(username) => setSession({ status: "user", username })} />;
  }

  return (
    <main className="flex min-h-full flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 px-6 pt-8 pb-6 sm:px-10 sm:pt-10">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-8 w-1.5 rounded-full bg-accent" />
            <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">تخته پروژه</h1>
          </div>
          <p className="mt-2 hidden pr-4.5 text-sm text-gray-text sm:block">
            کارت‌ها را بکشید و جابه‌جا کنید؛ برای تغییر نام ستون روی عنوانش کلیک کنید.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            aria-pressed={chatOpen}
            onClick={() => setChatOpen((o) => !o)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
              chatOpen ? "bg-primary text-white hover:brightness-110" : "bg-primary/10 text-primary hover:bg-primary/15"
            }`}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M4 5h12v8H8l-4 3V5z" strokeLinejoin="round" />
            </svg>
            {chatOpen ? "بستن دستیار" : "دستیار هوش مصنوعی"}
          </button>
          <span className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-gray-text" dir="ltr">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-navy text-xs font-bold text-white uppercase" aria-hidden>
              {session.username[0]}
            </span>
            {session.username}
          </span>
          <button
            type="button"
            onClick={() => setPasswordOpen(true)}
            className="rounded-lg px-3 py-1.5 font-medium whitespace-nowrap text-gray-text transition hover:bg-slate-100 hover:text-navy"
          >
            تغییر رمز
          </button>
          <button
            type="button"
            onClick={async () => {
              await logout().catch(() => {});
              setSession({ status: "anonymous" });
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-primary transition hover:border-primary hover:bg-sky-50"
          >
            خروج
          </button>
        </div>
      </header>
      <Workspace chatOpen={chatOpen} />
      {passwordOpen && <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />}
    </main>
  );
}
