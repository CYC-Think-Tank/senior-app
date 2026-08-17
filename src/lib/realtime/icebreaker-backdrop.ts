/**
 * Maps an icebreaker answer to the backdrop that should rise behind the room.
 *
 * Rosie opens with "What's your favourite season?" and "Tea or coffee?", so the
 * answers are short and tightly constrained. Reading them off the transcript
 * keeps the backdrop working without spending a model turn on a tool call.
 */

export type BackdropKey =
  | "spring"
  | "summer"
  | "autumn"
  | "winter"
  | "tea"
  | "coffee";

/** One backdrop per icebreaker, so a later answer cannot repaint an earlier one. */
export type BackdropGroup = "season" | "beverage";

export type BackdropMatch = { key: BackdropKey; group: BackdropGroup };

// Chinese writes no word boundaries, so those patterns match the bare
// character; Cantonese and Mandarin share the written form.
// "Springtime" and "summertime" are ordinary answers, so the seasons tolerate
// that suffix. "Tea" stays strict: a loose prefix would fire on "teach".
const PATTERNS: Array<BackdropMatch & { tests: RegExp[] }> = [
  { key: "spring", group: "season", tests: [/\bspring(?:time)?\b/g, /春/g] },
  { key: "summer", group: "season", tests: [/\bsummer(?:time)?\b/g, /夏/g] },
  { key: "autumn", group: "season", tests: [/\bautumn\b/g, /\bfall\b/g, /秋/g] },
  { key: "winter", group: "season", tests: [/\bwinter(?:time)?\b/g, /冬/g] },
  { key: "tea", group: "beverage", tests: [/\btea\b/g, /茶/g] },
  { key: "coffee", group: "beverage", tests: [/\bcoffees?\b/g, /咖啡/g] },
];

/**
 * Returns the option the guest named *last*, so "not tea, coffee please" lands
 * on coffee. Null when the answer names none of them.
 */
export function detectBackdrop(text: string): BackdropMatch | null {
  const haystack = text.toLowerCase();
  let best: BackdropMatch | null = null;
  let bestAt = -1;

  for (const { key, group, tests } of PATTERNS) {
    for (const test of tests) {
      // Reset per use: these literals carry /g and keep lastIndex between calls.
      test.lastIndex = 0;
      let at = -1;
      let hit: RegExpExecArray | null;
      while ((hit = test.exec(haystack)) !== null) {
        at = hit.index;
        if (hit.index === test.lastIndex) test.lastIndex++;
      }
      if (at > bestAt) {
        bestAt = at;
        best = { key, group };
      }
    }
  }

  return best;
}
