import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  notebook_pages,
  notebook_state,
  notebooks,
} from "$lib/server/database/schema";

const USER_ID = "default";

function now() {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export async function createDefaultNotebook() {
  const timestamp = now();
  const notebookId = randomUUID();
  const pageId = randomUUID();

  await db.insert(notebooks).values({
    id: notebookId,
    userId: USER_ID,
    title: "Notebook 1",
    activePageId: pageId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.insert(notebook_pages).values({
    id: pageId,
    notebookId,
    title: "Page 1",
    content: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db
    .insert(notebook_state)
    .values({
      userId: USER_ID,
      activeNotebookId: notebookId,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: notebook_state.userId,
      set: {
        activeNotebookId: notebookId,
        updatedAt: timestamp,
      },
    });

  return notebookId;
}

export async function loadNotebookState() {
  let notebookRows = await db
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

  const output = [];

  for (const notebook of notebookRows) {
    const pages = await db
      .select()
      .from(notebook_pages)
      .where(eq(notebook_pages.notebookId, notebook.id))
      .orderBy(asc(notebook_pages.createdAt));

    output.push({
      ...notebook,
      pages,
    });
  }

  const fallbackActiveNotebookId = notebookRows[0]?.id ?? null;
  const activeNotebookId =
    notebookRows.find((item) => item.id === stateRow?.activeNotebookId)?.id ??
    fallbackActiveNotebookId;

  return {
    activeNotebookId,
    notebooks: output,
  };
}

export async function setActiveNotebook(notebookId: string | null) {
  await db
    .insert(notebook_state)
    .values({
      userId: USER_ID,
      activeNotebookId: notebookId,
      updatedAt: now(),
    })
    .onConflictDoUpdate({
      target: notebook_state.userId,
      set: {
        activeNotebookId: notebookId,
        updatedAt: now(),
      },
    });
}

export async function createNotebook(title: unknown) {
  const timestamp = now();
  const notebookId = randomUUID();
  const pageId = randomUUID();

  await db.insert(notebooks).values({
    id: notebookId,
    userId: USER_ID,
    title: asString(title, "New Notebook"),
    activePageId: pageId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.insert(notebook_pages).values({
    id: pageId,
    notebookId,
    title: "Page 1",
    content: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await setActiveNotebook(notebookId);

  return await loadNotebookState();
}

export async function selectNotebook(notebookId: unknown) {
  const id = asString(notebookId);

  const [notebook] = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.id, id))
    .limit(1);

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  await setActiveNotebook(notebook.id);

  return await loadNotebookState();
}

export async function renameNotebook({
  notebookId,
  title,
}: {
  notebookId: unknown;
  title: unknown;
}) {
  await db
    .update(notebooks)
    .set({
      title: asString(title, "Untitled Notebook"),
      updatedAt: now(),
    })
    .where(eq(notebooks.id, asString(notebookId)));

  return await loadNotebookState();
}

export async function deleteNotebook(notebookId: unknown) {
  const id = asString(notebookId);

  await db.delete(notebooks).where(eq(notebooks.id, id));

  const remaining = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.userId, USER_ID))
    .orderBy(asc(notebooks.createdAt));

  if (remaining.length === 0) {
    await createDefaultNotebook();
  } else {
    await setActiveNotebook(remaining[0].id);
  }

  return await loadNotebookState();
}

export async function createPage({
  notebookId,
  title,
}: {
  notebookId: unknown;
  title: unknown;
}) {
  const timestamp = now();
  const id = asString(notebookId);
  const pageId = randomUUID();

  await db.insert(notebook_pages).values({
    id: pageId,
    notebookId: id,
    title: asString(title, "New Page"),
    content: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db
    .update(notebooks)
    .set({
      activePageId: pageId,
      updatedAt: timestamp,
    })
    .where(eq(notebooks.id, id));

  return await loadNotebookState();
}

export async function selectPage({
  notebookId,
  pageId,
}: {
  notebookId: unknown;
  pageId: unknown;
}) {
  const id = asString(notebookId);
  const page = asString(pageId);
  const timestamp = now();

  await db
    .update(notebooks)
    .set({
      activePageId: page,
      updatedAt: timestamp,
    })
    .where(eq(notebooks.id, id));

  await setActiveNotebook(id);

  return await loadNotebookState();
}

export async function renamePage({
  pageId,
  title,
}: {
  pageId: unknown;
  title: unknown;
}) {
  await db
    .update(notebook_pages)
    .set({
      title: asString(title, "Untitled Page"),
      updatedAt: now(),
    })
    .where(eq(notebook_pages.id, asString(pageId)));

  return await loadNotebookState();
}

export async function updatePage({
  pageId,
  content,
}: {
  pageId: unknown;
  content: unknown;
}) {
  await db
    .update(notebook_pages)
    .set({
      content: String(content ?? ""),
      updatedAt: now(),
    })
    .where(eq(notebook_pages.id, asString(pageId)));

  return await loadNotebookState();
}

export async function deletePage({
  notebookId,
  pageId,
}: {
  notebookId: unknown;
  pageId: unknown;
}) {
  const timestamp = now();
  const notebook = asString(notebookId);
  const page = asString(pageId);

  await db.delete(notebook_pages).where(eq(notebook_pages.id, page));

  const remainingPages = await db
    .select()
    .from(notebook_pages)
    .where(eq(notebook_pages.notebookId, notebook))
    .orderBy(asc(notebook_pages.createdAt));

  if (remainingPages.length === 0) {
    const newPageId = randomUUID();

    await db.insert(notebook_pages).values({
      id: newPageId,
      notebookId: notebook,
      title: "Page 1",
      content: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await db
      .update(notebooks)
      .set({
        activePageId: newPageId,
        updatedAt: timestamp,
      })
      .where(eq(notebooks.id, notebook));
  } else {
    await db
      .update(notebooks)
      .set({
        activePageId: remainingPages[0].id,
        updatedAt: timestamp,
      })
      .where(eq(notebooks.id, notebook));
  }

  return await loadNotebookState();
}