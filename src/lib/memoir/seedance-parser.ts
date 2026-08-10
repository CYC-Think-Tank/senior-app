export function findTaskId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["id", "task_id", "taskId"]) {
    if (typeof obj[key] === "string") return obj[key] as string;
  }
  for (const nested of [obj.data, obj.result]) {
    const found = findTaskId(nested);
    if (found) return found;
  }
  return null;
}

export function findVideoUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  for (const key of ["video_url", "videoUrl", "result_url", "url"]) {
    const candidate = obj[key];
    if (typeof candidate === "string" && /^https:\/\//.test(candidate)) return candidate;
  }
  for (const nested of Object.values(obj)) {
    const found = findVideoUrl(nested);
    if (found) return found;
  }
  return null;
}

export function findTaskStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const obj = value as Record<string, unknown>;
  if (typeof obj.status === "string") return obj.status.toLowerCase();
  return findTaskStatus(obj.data ?? obj.result);
}
