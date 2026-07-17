import { json, type RequestHandler } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebooks, notebook_pages, type NewNotebook, type NewNotebookPage } from "$lib/server/database/schema";
import { loadNotebookState, setActiveNotebook } from "$routes/(app)/notebooks/utils";

const USER_ID = "default";

export const GET: RequestHandler = async () => {
  return json(await loadNotebookState());
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim() || "New Notebook";
  const requestedPageTitle = body?.pageTitle == null ? null : String(body.pageTitle).trim();

  if (body?.pageTitle != null && !requestedPageTitle) {
    return json({ message: "Enter a page name." }, { status: 400 });
  }

  const existingNotebooks = await db
    .select({ title: notebooks.title })
    .from(notebooks)
    .where(eq(notebooks.userId, USER_ID));
  if (existingNotebooks.some((notebook) => notebook.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase())) {
    return json({ message: `A notebook named “${title}” already exists.` }, { status: 409 });
  }

  const timestamp = new Date().toISOString();
  const notebookId = randomUUID();
  const pageId = randomUUID();

  const notebook: NewNotebook = {
    id: notebookId,
    userId: USER_ID,
    title,
    activePageId: pageId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const page: NewNotebookPage = {
    id: pageId,
    notebookId,
    title: requestedPageTitle || "Page 1",
    content: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.transaction(async (tx) => {
    await tx.insert(notebooks).values(notebook);
    await tx.insert(notebook_pages).values(page);
  });
  await setActiveNotebook(notebookId);

  return json({
    ...(await loadNotebookState()),
    createdNotebookId: notebookId,
    createdPageId: pageId,
  }, { status: 201 });
};
