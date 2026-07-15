import { json, type RequestHandler } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { NotebookTitleRequest } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { notebooks } from "$lib/server/database/schema";
import { loadNotebookState } from "$routes/(app)/notebooks/utils";

export const PATCH: RequestHandler = async ({ params, request }) => {
  const id = params.id;
  if (!id) return json({ error: "Missing notebook id" }, { status: 400 });
  const body = (await request.json()) as NotebookTitleRequest;
  const title = body.title.trim();
  if (!title) {
    return json({ error: "Notebook title is required" }, { status: 400 });
  }

  await db
    .update(notebooks)
    .set({ title, updatedAt: new Date().toISOString() })
    .where(eq(notebooks.id, id));

  return json(await loadNotebookState());
};
