/**
 * Changes the assistant proposed with a reply. They are stored on the server with the message (so they
 * survive a reload); `changes` describes them in Persian, as the board was when they were proposed.
 */
export type Proposal = {
  changes: string[];
  status: "pending" | "applied" | "rejected" | "undone";
};
