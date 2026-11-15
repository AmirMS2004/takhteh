"use client";

import { useRef, useState } from "react";
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
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import * as api from "@/lib/api";
import type { BoardStore } from "@/lib/useBoard";
import {
  addCard,
  deleteCard,
  findColumn,
  moveCard,
  renameColumn,
  updateCard,
  type BoardState,
} from "@/lib/board";
import { ColumnView } from "./ColumnView";
import { CardView } from "./CardItem";

function position(board: BoardState, cardId: string) {
  const column = findColumn(board, cardId)!;
  return { columnId: column.id, index: column.cardIds.indexOf(cardId) };
}

export function Board({ store }: { store: BoardStore }) {
  const { board, failed, apply, current, persist, notice, dismissNotice } = store;
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragStart = useRef<BoardState | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // On touch screens a swipe scrolls the board; a short press-and-hold starts a drag.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (failed && !board) {
    return <p className="px-6 text-sm text-red-700 sm:px-10">بارگذاری برد ناموفق بود. صفحه را دوباره بارگذاری کنید.</p>;
  }
  if (!board) {
    return <p className="px-6 text-sm text-gray-text sm:px-10">در حال بارگذاری…</p>;
  }

  // Target the column under the pointer; inside it, snap to the nearest card (or the column if empty).
  const collisionDetection: CollisionDetection = (args) => {
    const b = current();
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
  };

  // Move the card into another column while hovering, so the target list makes room for it.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
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
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    if (!over) {
      apply(start);
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
    if (dragStart.current) apply(dragStart.current);
    dragStart.current = null;
  };

  const activeCard = activeId ? board.cards[activeId] : null;

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
        <div role="alert" className="mx-6 mb-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700 sm:mx-10">
          {notice}
          <button type="button" onClick={dismissNotice} className="font-medium hover:underline">
            بستن
          </button>
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto px-6 pb-6 sm:px-10">
        {board.columns.map((column) => (
          <ColumnView
            key={column.id}
            column={column}
            cards={column.cardIds.map((id) => board.cards[id])}
            onRename={(title) => {
              apply(renameColumn(current(), column.id, title));
              persist(api.renameColumn(column.id, title));
            }}
            onAdd={(title, details) =>
              persist(
                api.createCard(column.id, title, details).then((card) => apply(addCard(current(), column.id, card))),
              )
            }
            onDelete={(cardId) => {
              apply(deleteCard(current(), cardId));
              persist(api.deleteCard(cardId));
            }}
            onUpdate={(cardId, title, details) => {
              apply(updateCard(current(), cardId, { title, details }));
              persist(api.updateCard(cardId, { title, details }));
            }}
          />
        ))}
      </div>
      <DragOverlay>{activeCard && <CardView card={activeCard} overlay />}</DragOverlay>
    </DndContext>
  );
}
