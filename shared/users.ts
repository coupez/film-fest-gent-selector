// The two people sharing a room. Later this can come from email-based accounts.
export const USERS = [
  { id: "lucas", name: "Lucas", langs: ["English", "Dutch"], color: "#ff7a59" },
  { id: "margarita", name: "Margarita", langs: ["English", "Italian"], color: "#c084fc" },
] as const;

export type UserId = (typeof USERS)[number]["id"];
export type User = (typeof USERS)[number];

export const findUser = (id: unknown): User | undefined => USERS.find((u) => u.id === id);
export const otherUser = (id: UserId): User => USERS.find((u) => u.id !== id)!;
