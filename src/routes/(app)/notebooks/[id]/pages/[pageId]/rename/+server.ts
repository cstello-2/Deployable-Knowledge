import { json, type RequestHandler } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { NotebookPageTitleRequest } from "$lib/requestTypes";
import { db } from "$lib/server/database/database";
import { notebook_pages } from "$lib/server/database/schema";
import { loadNotebookState } from "$routes/(app)/notebooks/utils";

export const PATCH: RequestHandler = async ({ params, request }) => {
  const pageId = params.pageId;
  if (!pageId) return json({ error: "Missing page id" }, { status: 400 });
  const body = (await request.json()) as NotebookPageTitleRequest;
  const title = body.title.trim();
  if (!title) {
    return json({ error: "Page title is required" }, { status: 400 });
  }

  await db
    .update(notebook_pages)
    .set({ title, updatedAt: new Date().toISOString() })
    .where(eq(notebook_pages.id, pageId));

  return json(await loadNotebookState());
};
