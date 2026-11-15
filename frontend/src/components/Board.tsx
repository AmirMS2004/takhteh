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
  useSensor,
  type CollisionDetection,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import * as api from "@/lib/api";
import type { BoardStore } from "@/lib/useBoard";
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
import { emptyFilter, isActive, matches, type Filter } from "@/lib/filter";
import { AddColumn, ColumnPreview, ColumnView } from "./ColumnView";
import { FilterBar } from "./FilterBar";
import { LabelsDialog } from "./LabelsDialog";
import { CardView } from "./CardItem";

function position(board: BoardState, cardId: string) {
  const column = findColumn(board, cardId)!;
  return { columnId: column.id, index: column.cardIds.indexOf(cardId) };
}

export function Board({ store }: { store: BoardStore }) {
  const { board, failed, apply, current, persist, notice, dismissNotice } = store;
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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // On touch screens a swipe scrolls the board; a short press-and-hold starts a drag.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (failed && !board) {
    return <p className="px-6 text-sm text-danger sm:px-10">بارگذاری تخته ناموفق بود. صفحه را دوباره بارگذاری کنید.</p>;
  }
  if (!board) {
    return <p className="px-6 text-sm text-gray-text sm:px-10">در حال بارگذاری…</p>;
  }

  const isColumn = (id: string) => current().columns.some((c) => c.id === id);

  // A dragged column only collides with columns. A dragged card targets the column under the pointer and,
  // inside it, snaps to the nearest card (or the column itself if it is empty).
  const collisionDetection: CollisionDetection = (args) => {
    const b = current();
    if (isColumn(String(args.active.id))) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => isColumn(String(c.id))),
      });
    }
    const column = pointerWithin(args).find((hit) => b.columns.some((c) => c.id === hit.id));
    if (!column) return closestCorners(args);
    const cardIds = findColumn(b, String(column.id))!.cardIds;
    if (cardIds.length === 0) return [column];
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => cardIds.includes(String(c.id))),
    });
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
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {notice && (
        <div role="alert" className="mx-6 mb-4 flex items-center justify-between gap-3 rounded-xl bg-danger-50 px-4 py-2.5 text-sm text-danger sm:mx-10">
          {notice}
          <button type="button" onClick={dismissNotice} className="font-medium hover:underline">
            بستن
          </button>
        </div>
      )}
      {/* Search and filters first; the labels button follows them, wrapping together on narrow screens. */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 px-6 sm:px-10">
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
          برچسب‌ها
        </button>
      </div>
      {filtering && (
        <p className="-mt-2 mb-3 px-6 text-xs text-gray-text sm:px-10">
          تا وقتی فیلتر فعال است، کارت‌ها جابه‌جا نمی‌شوند؛ ویرایش ممکن است.
        </p>
      )}
      <div className="flex gap-4 overflow-x-auto px-6 pb-6 sm:px-10">
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
                persist(api.deleteCard(cardId).then(offerRestore(`کارت «${title}» حذف شد.`)));
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
                persist(api.deleteColumn(column.id).then(offerRestore(`ستون «${column.title}» حذف شد.`)));
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
            بازگرداندن
          </button>
          <button type="button" aria-label="بستن" onClick={() => setDeleted(null)} className="rounded-md px-1.5 text-white/60 hover:text-white">
            ×
          </button>
        </div>
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
            persist(api.deleteLabel(id).then(offerRestore(`${labelTitle(label)} حذف شد.`)));
          }}
          onClose={() => setLabelsOpen(false)}
        />
      )}
    </DndContext>
  );
}
