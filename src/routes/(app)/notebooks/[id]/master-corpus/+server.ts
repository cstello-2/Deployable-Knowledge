import { error, json, type RequestHandler } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebook_pages, notebooks } from "$lib/server/database/schema";
import { storeNotebookInMasterCorpus } from "$lib/server/notebooks/master-corpus";

type MasterCorpusRequest = {
  pageIds?: unknown;
};

export const POST: RequestHandler = async ({ params, request }) => {
  const notebookId = params.id;
  if (!notebookId) error(400, "Missing notebook id");

  const body = (await request.json()) as MasterCorpusRequest;
  if (
    !Array.isArray(body.pageIds) ||
    body.pageIds.length === 0 ||
    body.pageIds.some((pageId) => typeof pageId !== "string")
  ) {
    error(400, "Select at least one notebook page");
  }

  const [notebook] = await db
    .select({ title: notebooks.title })
    .from(notebooks)
    .where(eq(notebooks.id, notebookId))
    .limit(1);
  if (!notebook) error(404, "Notebook not found");

  const selectedPageIds = new Set(body.pageIds);
  const pages = (
    await db
      .select({
        id: notebook_pages.id,
        title: notebook_pages.title,
        content: notebook_pages.content,
      })
      .from(notebook_pages)
      .where(eq(notebook_pages.notebookId, notebookId))
      .orderBy(asc(notebook_pages.createdAt))
  )
    .map((page, pageIndex) => ({ ...page, pageIndex }))
    .filter((page) => selectedPageIds.has(page.id));

  if (pages.length === 0) error(400, "Select at least one notebook page");

  try {
    return json(
      await storeNotebookInMasterCorpus({
        notebookId,
        notebookTitle: notebook.title,
        pages,
      }),
    );
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Master Corpus export failed";
    error(message.startsWith("Select at least") ? 400 : 500, message);
  }
};
