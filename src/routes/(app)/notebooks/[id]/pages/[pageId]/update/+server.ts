import { json, type RequestHandler } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebook_pages } from "$lib/server/database/schema";
import { loadNotebookState } from "$routes/(app)/notebooks/utils";

export const PATCH: RequestHandler = async ({ params, request }) => {
  const pageId = params.pageId;
  if (!pageId) return json({ error: "Missing page id" }, { status: 400 });
  const body = await request.json().catch(() => ({}));

  await db
    .update(notebook_pages)
    .set({ content: String(body?.content ?? ""), updatedAt: new Date().toISOString() })
    .where(eq(notebook_pages.id, pageId));

  return json(await loadNotebookState());
};
