import type { Session } from "$lib/server/database/schema";

export async function getSessions(): Promise<Session[]> {
  const req = new Request("/sessions", {
    method: "GET",
  });

  const resp = await fetch(req);
  const data = (await resp.json()) as Session[];

  return data;
}

export async function createSession(): Promise<Session> {
  const req = new Request("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  const resp = await fetch(req);
  const data = (await resp.json()) as Session;

  window.dispatchEvent(new CustomEvent("sessions:refresh"));

  return data;
}

export async function renameSession(id: string, title: string) {
  const req = new Request(`/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  await fetch(req);
}

export async function deleteSession(id: string) {
  const req = new Request(`/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  await fetch(req);
}
