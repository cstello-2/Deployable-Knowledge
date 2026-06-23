import { json, type RequestHandler } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebooks } from "$lib/server/database/schema";
import { loadNotebookState } from "$lib/server/notebooks";

export const PATCH: RequestHandler = async ({ params, request }) => {
  const id = params.id;
  if (!id) return json({ error: "Missing notebook id" }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim() || "Untitled Notebook";

  await db
    .update(notebooks)
    .set({ title, updatedAt: new Date().toISOString() })
    .where(eq(notebooks.id, id));

  return json(await loadNotebookState());
};
