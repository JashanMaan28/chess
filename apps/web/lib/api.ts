export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8787";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);
  if (opts.body && !(opts.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.msg)) || res.statusText;
    throw new ApiError(res.status, msg, msg);
  }
  return data as T;
}
