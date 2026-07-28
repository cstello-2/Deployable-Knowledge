import { randomUUID } from "node:crypto";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  notebook_pages,
  notebooks,
  type NewNotebookPage,
} from "$lib/server/database/schema";
import { uniqueNotebookPageTitle } from "$lib/server/notebooks/page-titles";
import {
  loadNotebookState,
  setActiveNotebook,
} from "$routes/(app)/notebooks/utils";

type MoveNotebookPageRequest = {
  destinationNotebookId?: unknown;
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const sourceNotebookId = params.id;
  const pageId = params.pageId;
  if (!sourceNotebookId || !pageId) {
    error(400, "Missing notebook or page id");
  }

  const body = (await request.json()) as MoveNotebookPageRequest;
  const destinationNotebookId =
    typeof body.destinationNotebookId === "string"
      ? body.destinationNotebookId
      : "";
  if (!destinationNotebookId) error(400, "Choose a destination notebook");
  if (destinationNotebookId === sourceNotebookId) {
    error(400, "Choose a different notebook");
  }

  const [[sourceNotebook], [destinationNotebook], [page]] = await Promise.all([
    db
      .select({ id: notebooks.id, activePageId: notebooks.activePageId })
      .from(notebooks)
      .where(eq(notebooks.id, sourceNotebookId))
      .limit(1),
    db
      .select({ id: notebooks.id, title: notebooks.title })
      .from(notebooks)
      .where(eq(notebooks.id, destinationNotebookId))
      .limit(1),
    db
      .select()
      .from(notebook_pages)
      .where(
        and(
          eq(notebook_pages.id, pageId),
          eq(notebook_pages.notebookId, sourceNotebookId),
        ),
      )
      .limit(1),
  ]);

  if (!sourceNotebook || !page) error(404, "Notebook page not found");
  if (!destinationNotebook) error(404, "Destination notebook not found");

  const destinationPages = await db
    .select({ title: notebook_pages.title })
    .from(notebook_pages)
    .where(eq(notebook_pages.notebookId, destinationNotebookId));
  const movedTitle = uniqueNotebookPageTitle(
    page.title,
    destinationPages.map((candidate) => candidate.title),
  );
  const timestamp = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await transaction
      .update(notebook_pages)
      .set({
        notebookId: destinationNotebookId,
        title: movedTitle,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(notebook_pages.id, pageId),
          eq(notebook_pages.notebookId, sourceNotebookId),
        ),
      );

    await transaction
      .update(notebooks)
      .set({ activePageId: pageId, updatedAt: timestamp })
      .where(eq(notebooks.id, destinationNotebookId));

    const remainingPages = await transaction
      .select({ id: notebook_pages.id })
      .from(notebook_pages)
      .where(eq(notebook_pages.notebookId, sourceNotebookId))
      .orderBy(asc(notebook_pages.createdAt));

    let sourceActivePageId = sourceNotebook.activePageId;
    if (remainingPages.length === 0) {
      const replacementPageId = randomUUID();
      const replacementPage: NewNotebookPage = {
        id: replacementPageId,
        notebookId: sourceNotebookId,
        title: "Page 1",
        content: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await transaction.insert(notebook_pages).values(replacementPage);
      sourceActivePageId = replacementPageId;
    } else if (
      sourceActivePageId === pageId ||
      !remainingPages.some((candidate) => candidate.id === sourceActivePageId)
    ) {
      sourceActivePageId = remainingPages[0].id;
    }

    await transaction
      .update(notebooks)
      .set({ activePageId: sourceActivePageId, updatedAt: timestamp })
      .where(eq(notebooks.id, sourceNotebookId));
  });

  await setActiveNotebook(sourceNotebookId);
  return json({
    ...(await loadNotebookState()),
    movedPageId: pageId,
    movedPageTitle: movedTitle,
    destinationNotebookTitle: destinationNotebook.title,
    renamed: movedTitle !== page.title,
  });
};
