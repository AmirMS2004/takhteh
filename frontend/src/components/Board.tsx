"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
import {
  addCard,
  deleteCard,
  findColumn,
  initialBoard,
  moveCard,
  renameColumn,
  updateCard,
  type BoardState,
} from "@/lib/board";
import { ColumnView } from "./ColumnView";
import { CardView } from "./CardItem";

export function Board() {
  const [board, setBoard] = useState<BoardState>(initialBoard);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Target the column under the pointer; inside it, snap to the nearest card (or the column if empty).
  const collisionDetection: CollisionDetection = (args) => {
    const column = pointerWithin(args).find((hit) => board.columns.some((c) => c.id === hit.id));
    if (!column) return closestCorners(args);
    const cardIds = findColumn(board, String(column.id))!.cardIds;
    if (cardIds.length === 0) return [column];
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => cardIds.includes(String(c.id))),
    });
  };

  const onDragStart =({ active }: DragStartEvent) => setActiveId(String(active.id));

  // Move the card into another column while hovering, so the target list makes room for it.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const cardId = String(active.id);
    const overId = String(over.id);
    setBoard((b) => {
      const from = findColumn(b, cardId);
      const to = findColumn(b, overId);
      if (!from || !to || from.id === to.id) return b;
      const index = to.id === overId ? to.cardIds.length : to.cardIds.indexOf(overId);
      return moveCard(b, cardId, to.id, index);
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const cardId = String(active.id);
    const overId = String(over.id);
    setBoard((b) => {
      const column = findColumn(b, cardId);
      if (!column || column.id !== findColumn(b, overId)?.id || cardId === overId) return b;
      const index = column.id === overId ? column.cardIds.length - 1 : column.cardIds.indexOf(overId);
      return moveCard(b, cardId, column.id, index);
    });
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
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-5 overflow-x-auto px-6 pb-8 sm:px-10">
        {board.columns.map((column) => (
          <ColumnView
            key={column.id}
            column={column}
            cards={column.cardIds.map((id) => board.cards[id])}
            onRename={(title) => setBoard((b) => renameColumn(b, column.id, title))}
            onAdd={(title, details) =>
              setBoard((b) => addCard(b, column.id, { id: crypto.randomUUID(), title, details }))
            }
            onDelete={(cardId) => setBoard((b) => deleteCard(b, cardId))}
            onUpdate={(cardId, title, details) =>
              setBoard((b) => updateCard(b, cardId, { title, details }))
            }
          />
        ))}
      </div>
      <DragOverlay>{activeCard && <CardView card={activeCard} overlay />}</DragOverlay>
    </DndContext>
  );
}
