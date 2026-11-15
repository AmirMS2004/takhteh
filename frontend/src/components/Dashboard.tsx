"use client";

import { useEffect, useState } from "react";
import { ApiError, listBoards, updateProfile, type Profile } from "@/lib/api";
import type { BoardSummary } from "@/lib/board";
import { AVATAR_COUNT, Avatar } from "./Avatar";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { input } from "./LoginForm";

const fa = (n: number) => n.toLocaleString("fa-IR");

/** Same rules as the backend, checked first so the user gets a specific message. */
function profileProblem(username: string, email: string) {
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) return "نام کاربری باید ۳ تا ۳۲ حرف انگلیسی، عدد یا _ باشد.";
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "ایمیل معتبر نیست.";
  return "";
}

function ProfileForm({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [email, setEmail] = useState(profile.email);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const form = {
    name: name.trim(),
    username: username.trim().toLowerCase(),
    email: email.trim(),
    avatar,
  };
  const changes = Object.fromEntries(
    Object.entries(form).filter(([k, v]) => v !== profile[k as keyof Profile]),
  ) as Partial<Profile>;
  const changed = Object.keys(changes).length > 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = profileProblem(form.username, form.email);
    if (problem) return setMessage({ ok: false, text: problem });
    setPending(true);
    setMessage(null);
    try {
      const saved = await updateProfile(changes);
      onProfile(saved);
      setUsername(saved.username);
      setMessage({ ok: true, text: "تغییرات ذخیره شد." });
    } catch (err) {
      setMessage({
        ok: false,
        text:
          err instanceof ApiError && err.status === 409
            ? `نام کاربری «${form.username}» گرفته شده است.`
            : "ارتباط با سرور برقرار نشد. دوباره تلاش کنید.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-labelledby="profile-title"
      className="space-y-5 overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-sm"
    >
      <div className="-mx-6 -mt-6 flex items-center gap-4 border-b border-line bg-lane px-6 py-5">
        <Avatar avatar={avatar} username={form.username || profile.username} size={64} />
        <div className="min-w-0">
          <h2 id="profile-title" className="truncate text-lg font-bold text-ink">
            {profile.name || profile.username}
          </h2>
          <p dir="ltr" className="text-right text-sm text-gray-text">
            @{profile.username}
          </p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-text">عکس پروفایل</legend>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: AVATAR_COUNT + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={i === 0 ? "بدون عکس (حرف اول نام کاربری)" : `عکس ${fa(i)}`}
                aria-pressed={avatar === i}
                onClick={() => setAvatar(i)}
                className={`rounded-[34%] p-0.5 transition ${
                  avatar === i ? "ring-3 ring-accent" : "ring-1 ring-line hover:ring-primary"
                }`}
              >
                <Avatar avatar={i} username={form.username || profile.username} size={40} />
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">نام</span>
          <input maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">نام کاربری</span>
          <input
            dir="ltr"
            maxLength={32}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={input}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-gray-text">ایمیل</span>
          <input
            inputMode="email"
            dir="ltr"
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </label>

        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-primary-50 text-primary-700" : "bg-danger-50 text-danger"}`}
          >
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending || !changed}
            className="rounded-lg bg-secondary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "لطفاً صبر کنید…" : "ذخیره تغییرات"}
          </button>
          <button
            type="button"
            onClick={() => setPasswordOpen(true)}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary-50"
          >
            تغییر رمز
          </button>
        </div>
      </form>
      {passwordOpen && <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />}
    </section>
  );
}

function BoardList({ onOpenBoard }: { onOpenBoard: (id: string) => void }) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  useEffect(() => {
    listBoards().then(setBoards, () => setBoards([]));
  }, []);

  return (
    <section
      aria-labelledby="boards-title"
      className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="h-5 w-1 rounded-full bg-accent" />
        <h2 id="boards-title" className="font-bold text-ink">
          تخته‌های من
        </h2>
        {boards && <span className="text-sm text-gray-text">({fa(boards.length)})</span>}
      </div>
      {!boards ? (
        <p className="text-sm text-gray-text">در حال بارگذاری…</p>
      ) : boards.length === 0 ? (
        <p className="text-sm text-gray-text">هنوز در هیچ تخته‌ای نیستید.</p>
      ) : (
        <ul className="space-y-2">
          {boards.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-mist px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-ink">{b.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      b.role === "owner" ? "bg-accent/15 text-ink" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {b.role === "owner" ? "مالک" : "عضو"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-text">
                  {b.role === "member" && (
                    <>
                      مالک: <span dir="ltr">{b.owner}</span> ·{" "}
                    </>
                  )}
                  {fa(b.members)} عضو · {fa(b.cards)} کارت · {fa(b.my_cards)} کارت با مسئولیت من
                </p>
              </div>
              <button
                type="button"
                aria-label={`باز کردن ${b.title}`}
                onClick={() => onOpenBoard(b.id)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary-50"
              >
                باز کردن
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The signed-in user's page: profile, picture, password and the boards they are on. */
export function Dashboard({
  profile,
  onProfile,
  onOpenBoard,
}: {
  profile: Profile;
  onProfile: (p: Profile) => void;
  onOpenBoard: (id: string) => void;
}) {
  return (
    <div className="space-y-6 px-6 pb-10 sm:px-10">
      <div>
        <div className="flex items-center gap-2">
          <span className="h-6 w-1 rounded-full bg-accent" />
          <h1 className="text-2xl font-extrabold text-ink">داشبورد من</h1>
        </div>
        <p className="mt-1 pr-3 text-sm text-gray-text">پروفایل، عکس و رمز خود را تغییر دهید و تخته‌هایتان را ببینید.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <ProfileForm profile={profile} onProfile={onProfile} />
        <BoardList onOpenBoard={onOpenBoard} />
      </div>
    </div>
  );
}
