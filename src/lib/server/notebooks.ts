import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  notebook_pages,
  notebook_state,
  notebooks,
  type NewNotebook,
  type NewNotebookPage,
  type NewNotebookState,
  type Notebook,
  type NotebookPage,
} from "$lib/server/database/schema";

export type NotebookWithPages = Notebook & { pages: NotebookPage[] };

export type NotebookStateResponse = {
  activeNotebookId: string | null;
  notebooks: NotebookWithPages[];
};

const USER_ID = "default";

export async function createDefaultNotebook(): Promise<string> {
  const timestamp = new Date().toISOString();
  const notebookId = randomUUID();
  const pageId = randomUUID();

  const notebook: NewNotebook = {
    id: notebookId,
    userId: USER_ID,
    title: "Notebook 1",
    activePageId: pageId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const page: NewNotebookPage = {
    id: pageId,
    notebookId,
    title: "Page 1",
    content: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const state: NewNotebookState = {
    userId: USER_ID,
    activeNotebookId: notebookId,
    updatedAt: timestamp,
  };

  await db.insert(notebooks).values(notebook);
  await db.insert(notebook_pages).values(page);
  await db
    .insert(notebook_state)
    .values(state)
    .onConflictDoUpdate({
      target: notebook_state.userId,
      set: { activeNotebookId: notebookId, updatedAt: timestamp },
    });

  return notebookId;
}

export async function setActiveNotebook(notebookId: string | null): Promise<void> {
  const timestamp = new Date().toISOString();
  const state: NewNotebookState = {
    userId: USER_ID,
    activeNotebookId: notebookId,
    updatedAt: timestamp,
  };

  await db
    .insert(notebook_state)
    .values(state)
    .onConflictDoUpdate({
      target: notebook_state.userId,
      set: { activeNotebookId: notebookId, updatedAt: timestamp },
    });
}

export async function loadNotebookState(): Promise<NotebookStateResponse> {
  let notebookRows: Notebook[] = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.userId, USER_ID))
    .orderBy(asc(notebooks.createdAt));

  if (notebookRows.length === 0) {
    await createDefaultNotebook();
    notebookRows = await db
      .select()
      .from(notebooks)
      .where(eq(notebooks.userId, USER_ID))
      .orderBy(asc(notebooks.createdAt));
  }

  const [stateRow] = await db
    .select()
    .from(notebook_state)
    .where(eq(notebook_state.userId, USER_ID))
    .limit(1);

  const output: NotebookWithPages[] = [];

  for (const notebook of notebookRows) {
    const pages: NotebookPage[] = await db
      .select()
      .from(notebook_pages)
      .where(eq(notebook_pages.notebookId, notebook.id))
      .orderBy(asc(notebook_pages.createdAt));

    output.push({ ...notebook, pages });
  }

  const activeNotebookId =
    notebookRows.find((item) => item.id === stateRow?.activeNotebookId)?.id ??
    notebookRows[0]?.id ??
    null;

  return { activeNotebookId, notebooks: output };
}
