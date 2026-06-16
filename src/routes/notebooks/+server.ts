import { json, type RequestHandler } from "@sveltejs/kit";
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

const USER_ID = "default";

type NotebookWithPages = Notebook & {
  pages: NotebookPage[];
};

type NotebookStateResponse = {
  activeNotebookId: string | null;
  notebooks: NotebookWithPages[];
};

type NotebookActionBody = {
  action?: string;
  title?: unknown;
  content?: unknown;
  notebookId?: unknown;
  notebook_id?: unknown;
  pageId?: unknown;
  page_id?: unknown;
};

async function createDefaultNotebook(): Promise<string> {
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
      set: {
        activeNotebookId: notebookId,
        updatedAt: timestamp,
      },
    });

  return notebookId;
}

async function setActiveNotebook(notebookId: string | null): Promise<void> {
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
      set: {
        activeNotebookId: notebookId,
        updatedAt: timestamp,
      },
    });
}

async function loadNotebookState(): Promise<NotebookStateResponse> {
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

    output.push({
      ...notebook,
      pages,
    });
  }

  const activeNotebookId =
    notebookRows.find((item) => item.id === stateRow?.activeNotebookId)?.id ??
    notebookRows[0]?.id ??
    null;

  return {
    activeNotebookId,
    notebooks: output,
  };
}

export const GET: RequestHandler = async () => {
  return json(await loadNotebookState());
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as NotebookActionBody;
    const action = String(body.action ?? "");

    if (action === "notebook.create") {
      const timestamp = new Date().toISOString();
      const notebookId = randomUUID();
      const pageId = randomUUID();
      const title = String(body.title ?? "").trim() || "New Notebook";

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
        title: "Page 1",
        content: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await db.insert(notebooks).values(notebook);
      await db.insert(notebook_pages).values(page);
      await setActiveNotebook(notebookId);

      return json(await loadNotebookState(), { status: 201 });
    }

    if (action === "notebook.select") {
      const notebookId = String(body.notebookId ?? body.notebook_id ?? "").trim();

      if (!notebookId) {
        return json({ error: "Missing notebook id" }, { status: 400 });
      }

      const [notebook] = await db
        .select()
        .from(notebooks)
        .where(eq(notebooks.id, notebookId))
        .limit(1);

      if (!notebook) {
        return json({ error: "Notebook not found" }, { status: 404 });
      }

      await setActiveNotebook(notebook.id);
      return json(await loadNotebookState());
    }

    if (action === "notebook.rename") {
      const notebookId = String(body.notebookId ?? body.notebook_id ?? "").trim();
      const title = String(body.title ?? "").trim() || "Untitled Notebook";

      if (!notebookId) {
        return json({ error: "Missing notebook id" }, { status: 400 });
      }

      await db
        .update(notebooks)
        .set({ title, updatedAt: new Date().toISOString() })
        .where(eq(notebooks.id, notebookId));

      return json(await loadNotebookState());
    }

    if (action === "notebook.delete") {
      const notebookId = String(body.notebookId ?? body.notebook_id ?? "").trim();

      if (!notebookId) {
        return json({ error: "Missing notebook id" }, { status: 400 });
      }

      await db.delete(notebooks).where(eq(notebooks.id, notebookId));

      const remaining: Notebook[] = await db
        .select()
        .from(notebooks)
        .where(eq(notebooks.userId, USER_ID))
        .orderBy(asc(notebooks.createdAt));

      if (remaining.length === 0) {
        await createDefaultNotebook();
      } else {
        await setActiveNotebook(remaining[0].id);
      }

      return json(await loadNotebookState());
    }

    if (action === "page.create") {
      const notebookId = String(body.notebookId ?? body.notebook_id ?? "").trim();
      const title = String(body.title ?? "").trim() || "New Page";

      if (!notebookId) {
        return json({ error: "Missing notebook id" }, { status: 400 });
      }

      const timestamp = new Date().toISOString();
      const pageId = randomUUID();

      const page: NewNotebookPage = {
        id: pageId,
        notebookId,
        title,
        content: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await db.insert(notebook_pages).values(page);

      await db
        .update(notebooks)
        .set({ activePageId: pageId, updatedAt: timestamp })
        .where(eq(notebooks.id, notebookId));

      await setActiveNotebook(notebookId);
      return json(await loadNotebookState(), { status: 201 });
    }

    if (action === "page.select") {
      const notebookId = String(body.notebookId ?? body.notebook_id ?? "").trim();
      const pageId = String(body.pageId ?? body.page_id ?? "").trim();

      if (!notebookId) {
        return json({ error: "Missing notebook id" }, { status: 400 });
      }

      if (!pageId) {
        return json({ error: "Missing page id" }, { status: 400 });
      }

      const [page] = await db
        .select()
        .from(notebook_pages)
        .where(eq(notebook_pages.id, pageId))
        .limit(1);

      if (!page || page.notebookId !== notebookId) {
        return json({ error: "Page not found" }, { status: 404 });
      }

      await db
        .update(notebooks)
        .set({ activePageId: pageId, updatedAt: new Date().toISOString() })
        .where(eq(notebooks.id, notebookId));

      await setActiveNotebook(notebookId);
      return json(await loadNotebookState());
    }

    if (action === "page.rename") {
      const pageId = String(body.pageId ?? body.page_id ?? "").trim();
      const title = String(body.title ?? "").trim() || "Untitled Page";

      if (!pageId) {
        return json({ error: "Missing page id" }, { status: 400 });
      }

      await db
        .update(notebook_pages)
        .set({ title, updatedAt: new Date().toISOString() })
        .where(eq(notebook_pages.id, pageId));

      return json(await loadNotebookState());
    }

    if (action === "page.update") {
      const pageId = String(body.pageId ?? body.page_id ?? "").trim();

      if (!pageId) {
        return json({ error: "Missing page id" }, { status: 400 });
      }

      await db
        .update(notebook_pages)
        .set({
          content: String(body.content ?? ""),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(notebook_pages.id, pageId));

      return json(await loadNotebookState());
    }

    if (action === "page.delete") {
      const notebookId = String(body.notebookId ?? body.notebook_id ?? "").trim();
      const pageId = String(body.pageId ?? body.page_id ?? "").trim();

      if (!notebookId) {
        return json({ error: "Missing notebook id" }, { status: 400 });
      }

      if (!pageId) {
        return json({ error: "Missing page id" }, { status: 400 });
      }

      const timestamp = new Date().toISOString();

      await db.delete(notebook_pages).where(eq(notebook_pages.id, pageId));

      const remainingPages: NotebookPage[] = await db
        .select()
        .from(notebook_pages)
        .where(eq(notebook_pages.notebookId, notebookId))
        .orderBy(asc(notebook_pages.createdAt));

      if (remainingPages.length === 0) {
        const newPageId = randomUUID();

        const page: NewNotebookPage = {
          id: newPageId,
          notebookId,
          title: "Page 1",
          content: "",
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        await db.insert(notebook_pages).values(page);

        await db
          .update(notebooks)
          .set({ activePageId: newPageId, updatedAt: timestamp })
          .where(eq(notebooks.id, notebookId));
      } else {
        await db
          .update(notebooks)
          .set({ activePageId: remainingPages[0].id, updatedAt: timestamp })
          .where(eq(notebooks.id, notebookId));
      }

      await setActiveNotebook(notebookId);
      return json(await loadNotebookState());
    }

    return json({ error: `Unknown notebook action: ${action}` }, { status: 400 });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
};
