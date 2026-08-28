/** A person's name for display, falling back to the local part of their email. */
export function personName(
  displayName: string | null | undefined,
  email: string | null | undefined
) {
  const raw =
    displayName?.trim() ||
    (email ?? "").split("@")[0].replace(/[._-]+/g, " ").trim() ||
    "Friend";
  return raw.replace(/(^|\s)(\p{L})/gu, (_, space, letter) =>
    `${space}${letter.toLocaleUpperCase()}`
  );
}

type NameableSession = {
  id: string;
  title: string | null;
  createdAt: string;
};

/**
 * Resolves a display name for every conversation, numbering the unnamed ones.
 * Numbering runs oldest-first so a conversation keeps its number as newer ones
 * are recorded, and counts only unnamed conversations so there are no gaps.
 */
export function conversationNames(
  sessions: NameableSession[],
  unnamedLabel: (index: number) => string
) {
  const names = new Map<string, string>();
  let unnamed = 0;

  for (const session of [...sessions].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  )) {
    const title = session.title?.trim();
    names.set(session.id, title || unnamedLabel(++unnamed));
  }

  return names;
}
