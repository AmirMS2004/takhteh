import { createContext } from "react";
import type { I18n } from "./i18n";

/** Sends a message to the board's AI assistant (and shows the chat); null where there is no assistant. */
export const AskAssistant = createContext<((message: string) => void) | null>(null);

/** Requests sent to the assistant from buttons, in the user's language. */
export const splitRequest = (title: string, { t }: I18n) => t("assistant.split", { title });
export const weeklyReport = ({ t }: I18n) => t("assistant.weekly");
export const prioritizeRequest = ({ t }: I18n) => t("assistant.prioritize");
export const setupRequest = (description: string, { t }: I18n) => t("assistant.setup", { description });
