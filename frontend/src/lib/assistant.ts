import { createContext } from "react";

/** Sends a message to the board's AI assistant (and shows the chat); null where there is no assistant. */
export const AskAssistant = createContext<((message: string) => void) | null>(null);

export const splitRequest = (title: string) => `کارت «${title}» را به چند کارت کوچک‌تر تقسیم کن.`;
export const WEEKLY_REPORT = "گزارش هفتگی این برد را بنویس.";
