import { json, type RequestHandler } from "@sveltejs/kit";
import {
  createNotebook,
  createPage,
  deleteNotebook,
  deletePage,
  loadNotebookState,
  renameNotebook,
  renamePage,
  selectNotebook,
  selectPage,
  updatePage,
} from "$lib/server/notebook/notebookService";

export const GET: RequestHandler = async () => {
  return json(await loadNotebookState());
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "notebook.create") {
      return json(await createNotebook(body.title), { status: 201 });
    }

    if (action === "notebook.select") {
      return json(await selectNotebook(body.notebookId ?? body.notebook_id));
    }

    if (action === "notebook.rename") {
      return json(
        await renameNotebook({
          notebookId: body.notebookId ?? body.notebook_id,
          title: body.title,
        }),
      );
    }

    if (action === "notebook.delete") {
      return json(await deleteNotebook(body.notebookId ?? body.notebook_id));
    }

    if (action === "page.create") {
      return json(
        await createPage({
          notebookId: body.notebookId ?? body.notebook_id,
          title: body.title,
        }),
        { status: 201 },
      );
    }

    if (action === "page.select") {
      return json(
        await selectPage({
          notebookId: body.notebookId ?? body.notebook_id,
          pageId: body.pageId ?? body.page_id,
        }),
      );
    }

    if (action === "page.rename") {
      return json(
        await renamePage({
          pageId: body.pageId ?? body.page_id,
          title: body.title,
        }),
      );
    }

    if (action === "page.update") {
      return json(
        await updatePage({
          pageId: body.pageId ?? body.page_id,
          content: body.content,
        }),
      );
    }

    if (action === "page.delete") {
      return json(
        await deletePage({
          notebookId: body.notebookId ?? body.notebook_id,
          pageId: body.pageId ?? body.page_id,
        }),
      );
    }

    return json({ error: `Unknown notebook action: ${action}` }, { status: 400 });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
};