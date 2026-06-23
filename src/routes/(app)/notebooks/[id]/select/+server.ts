import { json, type RequestHandler } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebooks } from "$lib/server/database/schema";
import { loadNotebookState, setActiveNotebook } from "$lib/server/notebooks";

export const POST: RequestHandler = async ({ params }) => {
  const id = params.id;
  if (!id) return json({ error: "Missing notebook id" }, { status: 400 });

  const [notebook] = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.id, id))
    .limit(1);

  if (!notebook) {
    return json({ error: "Notebook not found" }, { status: 404 });
  }

  await setActiveNotebook(notebook.id);
  return json(await loadNotebookState());
};
