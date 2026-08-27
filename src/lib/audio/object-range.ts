/**
 * Byte-range reads against Azure Blob Storage.
 *
 * Reading a whole blob to serve a few seconds of audio would move ~54MB for an
 * hour-long recording, so playback asks for the range it needs. This is a thin
 * name kept for the call sites that predate the storage module; the mechanics
 * live in `@/lib/storage`.
 */
import { readRange } from "@/lib/storage";

/**
 * Reads bytes `from`..`to` inclusive. Returns null when the object is missing;
 * a short buffer when the object ends before `to`, which is what a request for
 * the header of a small object gets.
 */
export async function fetchObjectRange(
  container: string,
  path: string,
  from: number,
  to: number
): Promise<Buffer | null> {
  return readRange(container, path, from, to);
}
