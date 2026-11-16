/**
 * Changes the assistant proposed with a reply. They are stored on the server with the message (so they
 * survive a reload). `items` describe them as data ({type, params}) for wording in the user's language;
 * `changes` are the Persian sentences, the only form proposals stored before items existed have.
 */
export type ProposalItem = { type: string; params: Record<string, unknown> };
export type Proposal = {
  changes: string[];
  items?: ProposalItem[] | null;
  status: "pending" | "applied" | "rejected" | "undone";
};
