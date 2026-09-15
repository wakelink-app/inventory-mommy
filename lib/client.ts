type ApiInit = RequestInit & { timeoutMs?: number };

export async function api<T>(url: string, init?: ApiInit): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const controller = timeoutMs ? new AbortController() : null;
  const timer = timeoutMs ? setTimeout(() => controller?.abort(), timeoutMs) : null;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      signal: controller?.signal ?? rest.signal,
    });
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new Error("This is taking too long. Press the button again.");
    }
    throw error instanceof Error && error.name === "AbortError"
      ? new Error("This is taking too long. Press the button again.")
      : new Error("Network error — check the app is running and try again.");
  } finally {
    if (timer) clearTimeout(timer);
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}
