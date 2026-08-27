import "server-only";
import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  type ContainerClient,
} from "@azure/storage-blob";

/**
 * Azure Blob Storage, in the shape the app used to get from Supabase Storage.
 *
 * The two "buckets" (`raw-audio`, `story-videos`) are containers of the same
 * name, both private — nothing here is ever served to a browser directly, so
 * no CORS rules and no public access level are involved. Audio is already
 * encrypted in app code before it arrives (`encryptAudio`), so storage-side
 * encryption is not what protects it.
 *
 * Errors are thrown rather than returned as `{ error }`: callers that used to
 * branch on Supabase's error object now let the failure propagate, except
 * where a missing blob is an ordinary outcome (`download`, `readRange`), which
 * return `null` instead.
 */

const globalForStorage = globalThis as unknown as {
  __seniorAppBlobService?: BlobServiceClient;
};

function serviceClient(): BlobServiceClient {
  if (!globalForStorage.__seniorAppBlobService) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error(
        "AZURE_STORAGE_CONNECTION_STRING is not set. Copy it from the storage " +
          "account's Access keys blade (see .env.example)."
      );
    }
    globalForStorage.__seniorAppBlobService =
      BlobServiceClient.fromConnectionString(connectionString);
  }
  return globalForStorage.__seniorAppBlobService;
}

function container(name: string): ContainerClient {
  return serviceClient().getContainerClient(name);
}

/** Azure reports a missing blob as a 404 on an otherwise ordinary request. */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { statusCode?: number }).statusCode === 404
  );
}

/**
 * Writes a blob, replacing any existing one at that path.
 *
 * Every caller passed `upsert: true` to Supabase, so overwrite is the only
 * behaviour offered here — `upload` on a block blob overwrites by default.
 */
export async function upload(
  containerName: string,
  path: string,
  body: Buffer,
  contentType = "application/octet-stream"
): Promise<void> {
  await container(containerName)
    .getBlockBlobClient(path)
    .uploadData(body, { blobHTTPHeaders: { blobContentType: contentType } });
}

/** Reads a whole blob. Returns null when it does not exist. */
export async function download(
  containerName: string,
  path: string
): Promise<Buffer | null> {
  try {
    return await container(containerName).getBlockBlobClient(path).downloadToBuffer();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export type StoredObject = { name: string; size: number };

/**
 * Lists the blobs directly under `prefix`, names relative to it — the shape
 * Supabase's `list()` returned, which callers rejoin as `${prefix}/${name}`.
 *
 * Listing is by hierarchy so a nested "folder" (`<prefix>/scenes/...`) is not
 * flattened into this prefix's results; those callers list the child prefix
 * separately, exactly as they did before.
 */
export async function list(
  containerName: string,
  prefix: string
): Promise<StoredObject[]> {
  const normalised = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const found: StoredObject[] = [];

  const iterator = container(containerName).listBlobsByHierarchy("/", {
    prefix: normalised,
  });

  for await (const item of iterator) {
    // `kind: "prefix"` is a virtual directory, the equivalent of the
    // folder rows Supabase returned with a null id and callers filtered out.
    if (item.kind === "prefix") continue;
    found.push({
      name: item.name.slice(normalised.length),
      size: item.properties.contentLength ?? 0,
    });
  }

  return found;
}

/** Deletes blobs, ignoring any that are already gone. */
export async function remove(
  containerName: string,
  paths: string[]
): Promise<void> {
  const client = container(containerName);
  await Promise.all(
    paths.map((path) =>
      client.getBlockBlobClient(path).deleteIfExists({
        deleteSnapshots: "include",
      })
    )
  );
}

/**
 * Reads bytes `from`..`to` inclusive.
 *
 * Playback needs this: an hour-long recording is ~54MB, and serving a few
 * seconds of it should not move the whole object. Returns null when the blob
 * is missing, and a short buffer when it ends before `to` — which is what a
 * request for the header of a small object gets.
 */
export async function readRange(
  containerName: string,
  path: string,
  from: number,
  to: number
): Promise<Buffer | null> {
  const count = to - from + 1;
  if (count <= 0) return Buffer.alloc(0);

  try {
    return await container(containerName)
      .getBlockBlobClient(path)
      .downloadToBuffer(from, count);
  } catch (error) {
    if (isNotFound(error)) return null;
    // A range that starts past the end of the blob is "range not satisfiable",
    // which for the caller means simply no bytes there.
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { statusCode?: number }).statusCode === 416
    ) {
      return Buffer.alloc(0);
    }
    throw error;
  }
}

/**
 * A short-lived read URL for one blob (a SAS token).
 *
 * Only the conversation export uses this, to hand paths to an archiver that
 * fetches them over HTTP. Signing needs the account key, so it only works with
 * an account-key connection string — the same credential everything else here
 * already relies on.
 */
export function signedUrl(
  containerName: string,
  path: string,
  ttlSeconds: number
): string {
  const client = container(containerName).getBlockBlobClient(path);
  const credential = serviceClient().credential;

  if (!(credential instanceof StorageSharedKeyCredential)) {
    throw new Error(
      "Signing a storage URL needs an account-key connection string; " +
        "AZURE_STORAGE_CONNECTION_STRING does not carry one."
    );
  }

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName: path,
      permissions: BlobSASPermissions.parse("r"),
      // Clock skew between Vercel and Azure can otherwise reject a token that
      // was only just minted.
      startsOn: new Date(Date.now() - 5 * 60 * 1000),
      expiresOn: new Date(Date.now() + ttlSeconds * 1000),
    },
    credential
  );

  return `${client.url}?${sas.toString()}`;
}
