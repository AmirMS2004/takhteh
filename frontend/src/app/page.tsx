"use client";

import { useEffect, useState } from "react";
import { Board } from "@/components/Board";
import { LoginForm } from "@/components/LoginForm";
import { getMe, logout } from "@/lib/api";

type Session = { status: "loading" } | { status: "anonymous" } | { status: "user"; username: string };

export default function Home() {
  const [session, setSession] = useState<Session>({ status: "loading" });

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
      <Board />
    </main>
  );
}
