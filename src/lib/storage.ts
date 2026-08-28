import "server-only";

import {
  BlobServiceClient,
  RestError,
  type ContainerClient,
} from "@azure/storage-blob";

/**
 * Azure Blob Storage, in the shape the app used Supabase Storage in.
 *
 * The container names match the old bucket names (RAW_BUCKET,
 * STORY_VIDEOS_BUCKET in src/lib/constants.ts) and the path strings are
 * unchanged, so stored paths mean the same thing they always did.
 *
 * Everything here handles ciphertext. Audio and video are sealed by
 * `encryptAudio` in app code *before* they arrive, and unsealed after they
 * leave, so storage-side encryption is not what protects them and this module
 * deliberately knows nothing about it.
 *
 * The browser never talks to storage directly — every upload and download is
 * proxied through a route handler — which is why no container is public and no
 * CORS rule is needed.
 */

let service: BlobServiceClient | undefined;

function blobService(): BlobServiceClient {
  if (service) return service;
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
  }
  service = BlobServiceClient.fromConnectionString(connectionString);
  return service;
}

function container(name: string): ContainerClient {
  return blobService().getContainerClient(name);
}

/** True for the "no such blob/container" errors, which callers treat as a miss. */
function isNotFound(error: unknown): boolean {
  return (
    error instanceof RestError &&
    (error.statusCode === 404 ||
      error.code === "BlobNotFound" ||
      error.code === "ContainerNotFound")
  );
}

/**
 * Writes an object, replacing any object already at that path.
 *
 * Always an overwrite, matching the `upsert: true` every call site passed:
 * re-running a failed stitch or re-archiving a scene has to land on the same
 * path rather than fail.
 */
export async function upload(
  containerName: string,
  path: string,
  body: Buffer,
  contentType = "application/octet-stream",
): Promise<void> {
  await container(containerName)
    .getBlockBlobClient(path)
    .uploadData(body, { blobHTTPHeaders: { blobContentType: contentType } });
}

/** Reads a whole object, or null when nothing is stored at that path. */
export async function download(
  containerName: string,
  path: string,
): Promise<Buffer | null> {
  try {
    return await container(containerName)
      .getBlockBlobClient(path)
      .downloadToBuffer();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export type StoredObject = { name: string; size: number };

/**
 * Lists the objects directly under a prefix, shallowest level only.
 *
 * `name` is the segment after the prefix, not the full path — the same thing
 * Supabase's `list()` returned, so callers keep rebuilding paths the way they
 * always did. Azure has no directory entries, so unlike Supabase there are no
 * folder placeholders to filter out; every entry here is a real object.
 */
export async function list(
  containerName: string,
  prefix: string,
): Promise<StoredObject[]> {
  const client = container(containerName);
  const normalised = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const objects: StoredObject[] = [];

  try {
    // byHierarchy with "/" keeps this from walking an entire session's tree
    // when a caller only wants the level it asked for.
    for await (const item of client
      .listBlobsByHierarchy("/", { prefix: normalised })) {
      if (item.kind !== "blob") continue;
      objects.push({
        name: item.name.slice(normalised.length),
        size: item.properties.contentLength ?? 0,
      });
    }
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }

  return objects.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Deletes objects, ignoring the ones that are already gone.
 *
 * Every caller is cleaning up after a delete or a remake, where an object
 * missing because a previous attempt got that far is the expected case, not an
 * error worth failing the request over.
 */
export async function remove(
  containerName: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const client = container(containerName);
  await Promise.all(
    paths.map(async (path) => {
      try {
        await client.getBlockBlobClient(path).deleteIfExists();
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }),
  );
}

/**
 * Reads bytes `from`..`to` inclusive.
 *
 * This is what makes playback affordable: an hour-long recording is tens of
 * megabytes, and a player asking for a few seconds from the middle must not
 * drag the whole object through a serverless function. Encrypted audio is
 * stored in independently sealed blocks precisely so a range can be decrypted
 * on its own — see src/lib/audio/encryption.ts.
 *
 * Returns null when the object is missing, and a short buffer when it ends
 * before `to`, which is what a request for the header of a small object gets.
 */
export async function readRange(
  containerName: string,
  path: string,
  from: number,
  to: number,
): Promise<Buffer | null> {
  try {
    return await container(containerName)
      .getBlockBlobClient(path)
      .downloadToBuffer(from, to - from + 1);
  } catch (error) {
    if (isNotFound(error)) return null;
    // Asking past the end of an object is how the caller discovers where the
    // end is, so it answers with "nothing there" rather than throwing.
    if (
      error instanceof RestError &&
      (error.statusCode === 416 || error.code === "InvalidRange")
    ) {
      return Buffer.alloc(0);
    }
    throw error;
  }
}
