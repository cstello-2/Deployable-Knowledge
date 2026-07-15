import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { documents } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  const document = await db
    .select()
    .from(documents)
    .where(eq(documents.id, params.id))
    .get();

  if (!document) {
    throw error(404, "Document not found.");
  }

  if (document.sourceType !== "PDF") {
    throw error(400, "Only PDF documents can be opened.");
  }

  try {
    const filePath = resolve(process.cwd(), document.sourcePath);
    const file = await readFile(filePath);
    const filename = basename(document.sourcePath);

    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch {
    throw error(404, "PDF file not found.");
  }
};
