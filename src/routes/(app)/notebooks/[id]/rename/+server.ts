import { json, type RequestHandler } from "@sveltejs/kit";
import { and, eq, ne } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebooks } from "$lib/server/database/schema";
import { loadNotebookState } from "$routes/(app)/notebooks/utils";

export const PATCH: RequestHandler = async ({ params, request }) => {
  const id = params.id;
  if (!id) return json({ message: "Missing notebook id." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  if (!title) return json({ message: "Notebook name cannot be empty." }, { status: 400 });

  const [notebook] = await db.select({ id: notebooks.id })
    .from(notebooks)
    .where(eq(notebooks.id, id))
    .limit(1);
  if (!notebook) return json({ message: "Notebook not found." }, { status: 404 });

  const siblings = await db.select({ title: notebooks.title })
    .from(notebooks)
    .where(and(eq(notebooks.userId, "default"), ne(notebooks.id, id)));
  if (siblings.some((item) => item.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase())) {
    return json({ message: `A notebook named “${title}” already exists.` }, { status: 409 });
  }

  await db
    .update(notebooks)
    .set({ title, updatedAt: new Date().toISOString() })
    .where(eq(notebooks.id, id));

  return json(await loadNotebookState());
};
