/** Keep provider HTML and network exceptions out of form feedback. */
export async function requestJson<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(
      "We couldn't connect. Check your connection and retry the same request.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "The service is temporarily unavailable. Please retry the same request.",
    );
  if (!data || typeof data !== "object")
    throw new Error(
      "We couldn't confirm the result. Please retry the same request.",
    );
  return data as T;
}
