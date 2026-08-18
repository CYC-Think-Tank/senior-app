/**
 * Literal terms to bias the transcriber toward. The storyteller's own name and
 * the subjects they came to talk about are exactly the words a transcriber
 * mangles — proper nouns it has never seen, in a conversation that will lean on
 * them constantly. They are hints rather than required output, so one that
 * never comes up costs nothing.
 *
 * The Realtime API rejects the session outright if a keyword contains `<`, `>`,
 * a carriage return or a line feed, and topics are free text a storyteller
 * typed into their profile. So they are cleaned here rather than trusted: a bad
 * character in a topic would otherwise take down the whole conversation.
 */
export function transcriptionKeywords({
  guestName,
  topics,
  topic,
}: {
  guestName?: string | null;
  topics?: string[] | null;
  topic?: string | null;
}): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  // The sitting's own topic leads the profile ones: it is what today is about.
  for (const raw of [guestName, topic, ...(topics ?? [])]) {
    const cleaned = raw?.replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    keywords.push(cleaned);
  }

  return keywords;
}
