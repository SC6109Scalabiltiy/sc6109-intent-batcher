const API_BASE = process.env.NEXT_PUBLIC_COORDINATOR_API_URL ?? "http://127.0.0.1:4000";
const DEFAULT_NETWORK = "sepolia";

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${withNetwork(path)}`, {
    cache: "no-store",
    ...init
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ network: DEFAULT_NETWORK, ...body })
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function withNetwork(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}network=${DEFAULT_NETWORK}`;
}
