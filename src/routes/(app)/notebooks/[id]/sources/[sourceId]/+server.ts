import { json, type RequestHandler } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { notebook_sources } from "$lib/server/database/schema";

// Remove a single attached source from a notebook.
export const DELETE: RequestHandler = async ({ params }) => {
  const notebookId = params.id;
  const sourceId = params.sourceId;
  if (!notebookId || !sourceId) {
    return json({ error: "Missing notebook or source id" }, { status: 400 });
  }

  await db
    .delete(notebook_sources)
    .where(
      and(
        eq(notebook_sources.notebookId, notebookId),
        eq(notebook_sources.id, sourceId),
      ),
    );

  return json({ ok: true });
};
