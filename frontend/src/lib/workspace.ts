import { createContext } from "react";

/** Opens a card's panel (checklist and comments); null where there is none. */
export const OpenCard = createContext<((cardId: string) => void) | null>(null);

/** Opens the board's history, optionally for one card; null where there is no history dialog. */
export const ShowHistory = createContext<((card?: { id: string; title: string }) => void) | null>(null);
