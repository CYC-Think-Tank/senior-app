import "server-only";

const WIX_QUERY_ITEMS_URL = "https://www.wixapis.com/wix-data/v2/items/query";
const WIX_REQUEST_TIMEOUT_MS = 15_000;
const WIX_MAX_PAGE_SIZE = 100;

export type WixDataItem = {
  id?: string;
  dataCollectionId?: string;
  data?: Record<string, unknown>;
  createdDate?: string;
  updatedDate?: string;
  [key: string]: unknown;
};

export type WixPagingMetadata = {
  count?: number;
  offset?: number;
  total?: number;
  tooManyToCount?: boolean;
  [key: string]: unknown;
};

export type WixCmsQueryResult = {
  dataItems: WixDataItem[];
  pagingMetadata?: WixPagingMetadata;
};

type WixErrorBody = {
  message?: string;
  details?: {
    applicationError?: { description?: string };
    validationError?: { fieldViolations?: Array<{ description?: string }> };
  };
};

export class WixCmsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WixCmsError";
  }
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new WixCmsError(`${name} is not configured.`, 503);
  }
  return value;
}

function wixErrorMessage(body: WixErrorBody | null): string {
  return (
    body?.details?.applicationError?.description ??
    body?.details?.validationError?.fieldViolations?.[0]?.description ??
    body?.message ??
    "Wix could not read the CMS collection."
  );
}

/**
 * Reads one page from a Wix CMS collection. Without `collectionId` this reads
 * the single collection named by WIX_CMS_COLLECTION_ID.
 */
export async function queryWixCmsCollection(options: {
  limit: number;
  offset: number;
  collectionId?: string;
  filter?: Record<string, unknown>;
}): Promise<WixCmsQueryResult> {
  const apiKey = requiredEnvironmentVariable("WIX_API_KEY");
  const siteId = requiredEnvironmentVariable("WIX_SITE_ID");
  const collectionId =
    options.collectionId?.trim() ||
    requiredEnvironmentVariable("WIX_CMS_COLLECTION_ID");

  let response: Response;
  try {
    response = await fetch(WIX_QUERY_ITEMS_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        "wix-site-id": siteId,
      },
      body: JSON.stringify({
        dataCollectionId: collectionId,
        query: {
          ...(options.filter ? { filter: options.filter } : {}),
          paging: {
            limit: options.limit,
            offset: options.offset,
          },
        },
        returnTotalCount: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(WIX_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "TimeoutError"
        ? "Wix took too long to respond."
        : "Wix could not be reached.";
    throw new WixCmsError(message, 502);
  }

  const body = (await response.json().catch(() => null)) as
    | WixCmsQueryResult
    | WixErrorBody
    | null;

  if (!response.ok) {
    throw new WixCmsError(wixErrorMessage(body as WixErrorBody | null), 502);
  }

  const result = body as WixCmsQueryResult | null;
  if (!result || !Array.isArray(result.dataItems)) {
    throw new WixCmsError("Wix returned an invalid CMS response.", 502);
  }

  return result;
}

/**
 * Reads every matching item from a Wix CMS collection, one page at a time.
 * `maxItems` bounds the work so a runaway collection cannot stall a request.
 */
export async function queryAllWixCmsItems(options: {
  collectionId: string;
  filter?: Record<string, unknown>;
  maxItems: number;
}): Promise<WixDataItem[]> {
  const items: WixDataItem[] = [];

  while (items.length < options.maxItems) {
    const limit = Math.min(WIX_MAX_PAGE_SIZE, options.maxItems - items.length);
    const page = await queryWixCmsCollection({
      collectionId: options.collectionId,
      filter: options.filter,
      limit,
      offset: items.length,
    });

    items.push(...page.dataItems);
    if (page.dataItems.length < limit) break;
  }

  return items;
}
