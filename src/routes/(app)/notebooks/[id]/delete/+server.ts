import { json, type RequestHandler } from "@sveltejs/kit";
import { asc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebooks, type Notebook } from "$lib/server/database/schema";
import { createDefaultNotebook, loadNotebookState, setActiveNotebook } from "$notebooks/utils";

const USER_ID = "default";

export const DELETE: RequestHandler = async ({ params }) => {
  const id = params.id;
  if (!id) return json({ error: "Missing notebook id" }, { status: 400 });

  await db.delete(notebooks).where(eq(notebooks.id, id));

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
};
