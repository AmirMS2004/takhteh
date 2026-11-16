"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { BoardState } from "@/lib/board";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/time";
import { Modal } from "./Modal";

/** The board's archived cards: bring one back to the bottom of its column, or delete it for good. */
export function ArchiveDialog({
  boardId,
  onBoard,
  onClose,
}: {
  boardId: string;
  onBoard: (board: BoardState) => void;
  onClose: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [cards, setCards] = useState<api.ArchivedCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listArchived(boardId).then(setCards, () => {
      setCards([]);
      setError(t("common.network"));
    });
  }, [boardId, t]);

  const act = async (card: api.ArchivedCard, call: () => Promise<unknown>) => {
    setError("");
    try {
      await call();
      setCards((all) => all!.filter((c) => c.id !== card.id));
      onBoard(await api.getBoard(boardId));
    } catch {
      setError(t("common.network"));
    }
  };

  return (
    <Modal title={t("archive.title")} hint={t("archive.hint")} onClose={onClose}>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {cards && cards.length === 0 && !error && <p className="text-sm text-gray-text">{t("archive.empty")}</p>}
      {cards && cards.length > 0 && (
        <ul className="divide-y divide-line">
          {cards.map((card) => (
            <li key={card.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p dir="auto" className="truncate text-sm font-medium text-ink">
                  {card.title}
                </p>
                <p className="text-xs text-gray-text">
                  <span dir="auto">{t("archive.from", { column: card.column })}</span> ·{" "}
                  {timeAgo(card.archived_at, i18n)}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("archive.restoreCard", { title: card.title })}
                onClick={() => act(card, () => api.updateCard(card.id, { archived: false }))}
                className="rounded-lg px-2.5 py-1 text-sm font-medium text-primary-700 transition hover:bg-primary-50"
              >
                {t("archive.restore")}
              </button>
              <button
                type="button"
                aria-label={t("card.delete", { title: card.title })}
                onClick={() =>
                  window.confirm(t("card.confirmDelete", { title: card.title })) &&
                  act(card, () => api.deleteCard(card.id))
                }
                className="rounded-lg px-2.5 py-1 text-sm text-gray-text transition hover:bg-danger-50 hover:text-danger"
              >
                {t("common.delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onClose}
        className="self-end rounded-lg bg-secondary px-5 py-2 text-sm font-semibold text-white hover:brightness-110"
      >
        {t("common.close")}
      </button>
    </Modal>
  );
}
