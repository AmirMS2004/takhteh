import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no modal dialogs: open and close them without the browser's focus handling.
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
// As in browsers, Escape asks the open modal dialog to cancel.
document.addEventListener("keydown", (e) => {
  const open = [...document.querySelectorAll("dialog[open]")].at(-1);
  if (e.key === "Escape" && open) open.dispatchEvent(new Event("cancel", { cancelable: true }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
