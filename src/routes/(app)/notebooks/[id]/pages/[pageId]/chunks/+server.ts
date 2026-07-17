import { json, type RequestHandler } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebook_pages, notebooks } from "$lib/server/database/schema";
import { loadNotebookState, setActiveNotebook } from "$routes/(app)/notebooks/utils";

const USER_ID = "default";

export const POST: RequestHandler = async ({ params, request }) => {
  const notebookId = params.id;
  const pageId = params.pageId;
  if (!notebookId || !pageId) {
    return json({ message: "Choose a notebook and page." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim();
  const chunkId = String(body?.chunkId ?? "").trim();
  if (!text || !chunkId) {
    return json({ message: "Chunk content and ID are required." }, { status: 400 });
  }

  const [notebook] = await db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, USER_ID)))
    .limit(1);
  const [page] = await db
    .select()
    .from(notebook_pages)
    .where(
      and(
        eq(notebook_pages.id, pageId),
        eq(notebook_pages.notebookId, notebookId),
      ),
    )
    .limit(1);

  if (!notebook || !page) {
    return json({ message: "The selected notebook page no longer exists." }, { status: 404 });
  }

  const chunkMarkers = [`Chunk ID: ${chunkId}`, `Galaxy node ID: ${chunkId}`];
  const duplicate = chunkMarkers.some((marker) => page.content.includes(marker));
  const timestamp = new Date().toISOString();

  if (!duplicate) {
    const content = page.content.trim()
      ? `${page.content.trimEnd()}\n\n${text}`
      : text;
    await db
      .update(notebook_pages)
      .set({ content, updatedAt: timestamp })
      .where(eq(notebook_pages.id, pageId));
  }

  await db
    .update(notebooks)
    .set({ activePageId: pageId, updatedAt: timestamp })
    .where(eq(notebooks.id, notebookId));
  await setActiveNotebook(notebookId);

  return json({
    ...(await loadNotebookState()),
    saved: !duplicate,
    duplicate,
    notebookId,
    pageId,
  });
};
