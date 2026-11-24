"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  type CollisionDetection,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import * as api from "@/lib/api";
import type { BoardStore } from "@/lib/useBoard";
import { useI18n } from "@/lib/i18n";
import {
  addCard,
  addColumn,
  addLabel,
  deleteCard,
  findColumn,
  moveCard,
  moveColumn,
  removeColumn,
  removeLabel,
  renameColumn,
  updateCard,
  updateLabel,
  type BoardState,
} from "@/lib/board";
import { labelTitle, today } from "@/lib/cardDetails";
import { dndAccessibility } from "@/lib/dndAnnouncements";
import { emptyFilter, isActive, matches, type Filter } from "@/lib/filter";
import { AddColumn, ColumnPreview, ColumnView } from "./ColumnView";
import { FilterBar } from "./FilterBar";
import { LabelsDialog } from "./LabelsDialog";
import { CardView } from "./CardItem";
import { CardPanel } from "./CardPanel";
import { OpenCard } from "@/lib/workspace";

function position(board: BoardState, cardId: string) {
  const column = findColumn(board, cardId)!;
  return { columnId: column.id, index: column.cardIds.indexOf(cardId) };
}

export function Board({ store }: { store: BoardStore }) {
  const { board, failed, apply, current, persist, notice, dismissNotice } = store;
  const i18n = useI18n();
  const { t } = i18n;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  // The latest deletion, offered for restoring for a few seconds.
  const [deleted, setDeleted] = useState<{ entry: string; text: string } | null>(null);
  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(null), 10000);
    return () => clearTimeout(timer);
  }, [deleted]);
  const offerRestore = (text: string) => (entry: string) => setDeleted({ entry, text });
  const [filter, setFilter] = useState<Filter>(emptyFilter);
  const dragStart = useRef<BoardState | null>(null);
  // The card whose panel (checklist and comments) is open.
  const [openCard, setOpenCard] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // On touch screens a swipe scrolls the board; a short press-and-hold starts a drag.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: (event, args) => keyboardCoordinates(event, args) }),
  );

  if (failed && !board) {
    return <p className="w-fit rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">{t("board.loadFailed")}</p>;
  }
  if (!board) {
    return <p className="text-sm text-white/70">{t("common.loading")}</p>;
  }

  const isColumn = (id: string) => current().columns.some((c) => c.id === id);

  // A dragged column only collides with columns. A dragged card targets the column under the pointer (with
  // the keyboard, which has no pointer, the column it overlaps most) and, inside it, snaps to the nearest card
  // (or the column itself if it is empty).
  const collisionDetection: CollisionDetection = (args) => {
    const b = current();
    if (isColumn(String(args.active.id))) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => isColumn(String(c.id))),
      });
    }
    const columns = { ...args, droppableContainers: args.droppableContainers.filter((c) => isColumn(String(c.id))) };
    const column = args.pointerCoordinates ? pointerWithin(columns)[0] : rectIntersection(columns)[0];
    if (!column) return closestCorners(args);
    const cardIds = findColumn(b, String(column.id))!.cardIds;
    if (cardIds.length === 0) return [column];
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => cardIds.includes(String(c.id))),
    });
  };

  // With the keyboard, left and right move a card to the nearest column on that side (dnd-kit's own rule
  // treats a card a pixel further left in the same column as "to the left"); up and down move it within
  // its column, and columns move as dnd-kit moves them.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    const { active, collisionRect, droppableRects } = args.context;
    const side = event.code === "ArrowLeft" ? -1 : event.code === "ArrowRight" ? 1 : 0;
    if (!side || !active || !collisionRect || isColumn(String(active.id))) return sortableKeyboardCoordinates(event, args);
    event.preventDefault();
    const center = collisionRect.left + collisionRect.width / 2;
    const target = current()
      .columns.map((c) => droppableRects.get(c.id))
      .filter((r) => r && (r.left + r.width / 2 - center) * side > r.width / 2)
      .sort((a, b) => Math.abs(a!.left - center) - Math.abs(b!.left - center))[0];
    return target ? { x: target.left + (target.width - collisionRect.width) / 2, y: collisionRect.top } : undefined;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    dragStart.current = current();
    setActiveId(String(active.id));
    store.hold(true);
  };

  // Move the card into another column while hovering, so the target list makes room for it.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || isColumn(String(active.id))) return;
    const b = current();
    const cardId = String(active.id);
    const overId = String(over.id);
    const from = findColumn(b, cardId);
    const to = findColumn(b, overId);
    if (!from || !to || from.id === to.id) return;
    const index = to.id === overId ? to.cardIds.length : to.cardIds.indexOf(overId);
    apply(moveCard(b, cardId, to.id, index));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    store.hold(false);
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    if (!over) {
      apply(start);
      return;
    }
    if (isColumn(String(active.id))) {
      const columnId = String(active.id);
      const index = current().columns.findIndex((c) => c.id === String(over.id));
      if (index >= 0 && start.columns[index]?.id !== columnId) {
        apply(moveColumn(current(), columnId, index));
        persist(api.moveColumn(columnId, index));
      }
      return;
    }
    const cardId = String(active.id);
    const overId = String(over.id);
    let next = current();
    const column = findColumn(next, cardId);
    if (column && column.id === findColumn(next, overId)?.id && cardId !== overId) {
      const index = column.id === overId ? column.cardIds.length - 1 : column.cardIds.indexOf(overId);
      next = moveCard(next, cardId, column.id, index);
      apply(next);
    }
    const before = position(start, cardId);
    const after = position(next, cardId);
    if (before.columnId !== after.columnId || before.index !== after.index) {
      persist(api.moveCard(cardId, after.columnId, after.index));
    }
  };

  const onDragCancel = () => {
    setActiveId(null);
    store.hold(false);
    if (dragStart.current) apply(dragStart.current);
    dragStart.current = null;
  };

  const activeCard = activeId ? board.cards[activeId] : null;
  const activeColumn = activeId ? board.columns.find((c) => c.id === activeId) : undefined;
  // Filtering hides cards. Dragging is paused meanwhile: with cards hidden, a drop position
  // could not be mapped back to the real order.
  const filtering = isActive(filter);
  const day = today();
  const visibleCards = (ids: string[]) =>
    ids.map((id) => board.cards[id]).filter((card) => matches(card, filter, board.labels, day));
  const visibleCount = board.columns.reduce((n, c) => n + visibleCards(c.cardIds).length, 0);

  return (
    <DndContext
      id="kanban-board"
      accessibility={dndAccessibility(current, i18n)}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {notice && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-danger-50 px-4 py-2.5 text-sm text-danger">
          {t(notice)}
          <button type="button" onClick={dismissNotice} className="font-medium hover:underline">
            {t("common.close")}
          </button>
        </div>
      )}
      {/* Search and filters first; the labels button follows them, wrapping together on narrow screens. */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <FilterBar
          filter={filter}
          onChange={setFilter}
          labels={board.labels}
          shown={visibleCount}
          total={Object.keys(board.cards).length}
        />
        <button
          type="button"
          onClick={() => setLabelsOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink transition hover:border-primary hover:text-primary"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 10.5V4a1 1 0 011-1h6.5L17 9.5 10.5 16 3 10.5z" strokeLinejoin="round" />
            <circle cx="7" cy="7" r="1.2" fill="currentColor" />
          </svg>
          {t("board.labels")}
        </button>
      </div>
      {filtering && (
        <p className="-mt-2 mb-3 text-xs text-white/70">
          {t("board.dragPaused")}
        </p>
      )}
      <OpenCard value={setOpenCard}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          <SortableContext items={board.columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            {board.columns.map((column) => (
              <ColumnView
                key={column.id}
                column={column}
                cards={visibleCards(column.cardIds)}
                filtering={filtering}
                onRename={(title) => {
                  apply(renameColumn(current(), column.id, title));
                  persist(api.renameColumn(column.id, title));
                }}
                onAdd={(fields) =>
                  persist(api.createCard(column.id, fields).then((card) => apply(addCard(current(), column.id, card))))
                }
                onDelete={(cardId) => {
                  const title = current().cards[cardId].title;
                  apply(deleteCard(current(), cardId));
                  persist(api.deleteCard(cardId).then(offerRestore(t("board.cardDeleted", { title }))));
                }}
                onUpdate={(cardId, changes) => {
                  apply(updateCard(current(), cardId, changes));
                  persist(api.updateCard(cardId, changes));
                }}
                labels={board.labels}
                members={board.members}
                onManageLabels={() => setLabelsOpen(true)}
                onDeleteColumn={() => {
                  apply(removeColumn(current(), column.id));
                  persist(api.deleteColumn(column.id).then(offerRestore(t("board.columnDeleted", { title: column.title }))));
                }}
              />
            ))}
          </SortableContext>
          <AddColumn
            onAdd={(title) =>
              persist(api.createColumn(current().id, title).then((column) => apply(addColumn(current(), column))))
            }
          />
        </div>
      </OpenCard>
      {deleted && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl bg-bar px-4 py-3 text-sm text-white shadow-[0_18px_40px_-12px_rgba(3,33,71,0.55)]"
        >
          <span>{deleted.text}</span>
          <button
            type="button"
            onClick={async () => {
              const { entry } = deleted;
              setDeleted(null);
              await persist(api.restoreActivity(current().id, entry).then(apply));
            }}
            className="rounded-md px-2 py-1 font-semibold text-accent transition hover:bg-white/10"
          >
            {t("common.restore")}
          </button>
          <button type="button" aria-label={t("common.close")} onClick={() => setDeleted(null)} className="rounded-md px-1.5 text-white/60 hover:text-white">
            ×
          </button>
        </div>
      )}
      {openCard && board.cards[openCard] && (
        <CardPanel
          card={board.cards[openCard]}
          members={board.members}
          onChecklist={(checklist, saved) => {
            apply(updateCard(current(), openCard, { checklist }));
            persist(saved);
          }}
          onAddItem={async (text) => {
            await persist(
              api.addChecklistItem(openCard, text).then((item) => {
                const card = current().cards[openCard];
                apply(updateCard(current(), openCard, { checklist: [...(card?.checklist ?? []), item] }));
              }),
            );
          }}
          onComments={(comments) => apply(updateCard(current(), openCard, { comments }))}
          onArchive={() => {
            const id = openCard;
            setOpenCard(null);
            apply(deleteCard(current(), id));
            persist(api.updateCard(id, { archived: true }));
          }}
          onClose={() => setOpenCard(null)}
        />
      )}
      <DragOverlay>
        {activeCard && <CardView card={activeCard} labels={board.labels} overlay />}
        {activeColumn && <ColumnPreview title={activeColumn.title} count={activeColumn.cardIds.length} />}
      </DragOverlay>
      {labelsOpen && (
        <LabelsDialog
          labels={board.labels}
          onCreate={(color) => persist(api.createLabel(current().id, "", color).then((label) => apply(addLabel(current(), label))))}
          onUpdate={(id, changes) => {
            apply(updateLabel(current(), id, changes));
            persist(api.updateLabel(id, changes));
          }}
          onDelete={(id) => {
            const label = current().labels.find((l) => l.id === id)!;
            apply(removeLabel(current(), id));
            persist(api.deleteLabel(id).then(offerRestore(t("board.labelDeleted", { label: labelTitle(label, i18n) }))));
          }}
          onClose={() => setLabelsOpen(false)}
        />
      )}
    </DndContext>
  );
}
