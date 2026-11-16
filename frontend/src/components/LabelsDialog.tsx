"use client";

import { useState } from "react";
import type { BoardLabel, LabelColor } from "@/lib/board";
import { LABEL_COLORS, colorOf, labelTitle } from "@/lib/cardDetails";
import { useI18n, type Key } from "@/lib/i18n";

type Props = {
  labels: BoardLabel[];
  onCreate: (color: LabelColor) => void;
  onUpdate: (id: string, changes: Partial<Omit<BoardLabel, "id">>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

function LabelRow({ label, onUpdate, onDelete }: { label: BoardLabel } & Pick<Props, "onUpdate" | "onDelete">) {
  const i18n = useI18n();
  const { t } = i18n;
  const title = labelTitle(label, i18n);
  const [name, setName] = useState(label.name);
  const saveName = () => name.trim() !== label.name && onUpdate(label.id, { name: name.trim() });

  return (
    <li className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <input
          aria-label={t("labels.nameOf", { label: title })}
          placeholder={t("labels.unnamed")}
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveName();
            }
          }}
          // Colored like the label on cards, so each row shows what the label looks like.
          className={`min-w-0 flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold outline-none placeholder:font-normal placeholder:opacity-70 focus:ring-4 focus:ring-primary/20 ${colorOf(label.color).pill}`}
        />
        <button
          type="button"
          aria-label={t("labels.delete", { label: title })}
          onClick={() => window.confirm(t("labels.confirmDelete", { label: title })) && onDelete(label.id)}
          className="rounded-md p-1.5 text-gray-text hover:bg-danger-50 hover:text-danger"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label={t("labels.colorOf", { label: title })}>
        {LABEL_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={label.color === c.value}
            aria-label={t(`color.${c.value}` as Key)}
            onClick={() => label.color !== c.value && onUpdate(label.id, { color: c.value })}
            className={`h-6 w-6 rounded-full ${c.swatch} ${label.color === c.value ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`}
          />
        ))}
      </div>
    </li>
  );
}

export function LabelsDialog({ labels, onCreate, onUpdate, onDelete, onClose }: Props) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy/30 px-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="labels-title"
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-6 shadow-[0_18px_40px_-16px_rgba(3,33,71,0.45)]"
      >
        <div>
          <h2 id="labels-title" className="text-lg font-bold text-ink">
            {t("labels.title")}
          </h2>
          <p className="mt-1 text-xs text-gray-text">{t("labels.hint")}</p>
        </div>
        <ul className="space-y-2 overflow-y-auto">
          {labels.map((label) => (
            <LabelRow key={label.id} label={label} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </ul>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onCreate("green")}
            className="flex-1 rounded-lg border border-dashed border-ink/20 py-2 text-sm font-medium text-primary hover:border-primary hover:bg-primary-50"
          >
            {t("labels.new")}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="rounded-lg bg-secondary px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
