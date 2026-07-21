import type { Application, ApplicationDraft } from "./types";

const BASE = "/api/applications";

async function toJSON<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const jsonInit = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export async function apiList(): Promise<Application[]> {
  return toJSON(await fetch(BASE, { cache: "no-store" }));
}

export async function apiCreate(draft: ApplicationDraft): Promise<Application> {
  return toJSON(await fetch(BASE, jsonInit("POST", draft)));
}

export async function apiUpdate(
  id: string,
  draft: ApplicationDraft,
): Promise<Application> {
  return toJSON(await fetch(`${BASE}/${id}`, jsonInit("PUT", draft)));
}

export async function apiDelete(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}

export async function apiClear(): Promise<void> {
  const res = await fetch(BASE, { method: "DELETE" });
  if (!res.ok) throw new Error("Clear failed");
}

export async function apiReplace(list: Application[]): Promise<Application[]> {
  return toJSON(await fetch(BASE, jsonInit("PUT", list)));
}
