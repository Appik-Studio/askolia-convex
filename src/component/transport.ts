import { env } from "./_generated/server.js";

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`Askolia API request failed (HTTP ${status}).`);
  }
}

export async function request(path: string, body: object): Promise<unknown> {
  if (!env.ASKOLIA_URL) throw new Error("ASKOLIA_URL is required.");
  const url = new URL(env.ASKOLIA_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("ASKOLIA_URL must be an HTTPS origin.");
  }
  if (!env.ASKOLIA_API_KEY) throw new Error("ASKOLIA_API_KEY is required.");
  const response = await fetch(new URL(path, url), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.ASKOLIA_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok) throw new ApiError(response.status);
  try {
    return await response.json();
  } catch {
    throw new Error("Askolia API returned invalid JSON.");
  }
}
