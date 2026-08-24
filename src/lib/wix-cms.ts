import "server-only";

const WIX_QUERY_ITEMS_URL = "https://www.wixapis.com/wix-data/v2/items/query";
const WIX_REQUEST_TIMEOUT_MS = 15_000;

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

/** Reads one page from the single Wix CMS collection configured for this app. */
export async function queryWixCmsCollection(options: {
  limit: number;
  offset: number;
}): Promise<WixCmsQueryResult> {
  const apiKey = requiredEnvironmentVariable("WIX_API_KEY");
  const siteId = requiredEnvironmentVariable("WIX_SITE_ID");
  const collectionId = requiredEnvironmentVariable("WIX_CMS_COLLECTION_ID");

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
