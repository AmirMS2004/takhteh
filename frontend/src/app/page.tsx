"use client";

import { useEffect, useState } from "react";
import { Board } from "@/components/Board";
import { ChatSidebar } from "@/components/ChatSidebar";
import { LoginForm } from "@/components/LoginForm";
import { getMe, logout } from "@/lib/api";
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

  useEffect(() => {
    getMe()
      .then((username) => setSession(username ? { status: "user", username } : { status: "anonymous" }))
      .catch(() => setSession({ status: "anonymous" }));
  }, []);

  if (session.status === "loading") return null;
  if (session.status === "anonymous") {
    return <LoginForm onLogin={(username) => setSession({ status: "user", username })} />;
  }

  return (
    <main className="flex min-h-full flex-1 flex-col">
      <header className="flex items-start justify-between gap-4 px-6 pt-10 pb-8 sm:px-10">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-8 w-1.5 rounded-full bg-accent" />
            <h1 className="text-3xl font-extrabold tracking-tight text-navy">تخته پروژه</h1>
          </div>
          <p className="mt-2 pr-4.5 text-sm text-gray-text">
            کارت‌ها را بکشید و بین ستون‌ها جابه‌جا کنید. برای تغییر نام ستون روی عنوان آن کلیک کنید.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            aria-pressed={chatOpen}
            onClick={() => setChatOpen((o) => !o)}
            className="rounded-lg bg-primary/10 px-3 py-1.5 font-medium text-primary transition hover:bg-primary/15"
          >
            {chatOpen ? "بستن دستیار" : "دستیار هوش مصنوعی"}
          </button>
          <span className="text-gray-text" dir="ltr">
            {session.username}
          </span>
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
    </main>
  );
}
