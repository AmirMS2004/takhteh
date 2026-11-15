import { createContext } from "react";

/** Opens the board's history, optionally for one card; null where there is no history dialog. */
export const ShowHistory = createContext<((card?: { id: string; title: string }) => void) | null>(null);
