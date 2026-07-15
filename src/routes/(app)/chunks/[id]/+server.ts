import { eq } from "drizzle-orm";
import { json } from "@sveltejs/kit";
import { db } from "$lib/server/database/database";
import { document_chunks, documents } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  const [chunk] = await db
    .select({
      chunkId: document_chunks.id,
      documentId: document_chunks.documentId,
      sourceTitle: documents.title,
      pageIndex: document_chunks.pageIndex,
      chunkIndex: document_chunks.chunkIndex,
      chunkType: document_chunks.chunkType,
      content: document_chunks.content,
    })
    .from(document_chunks)
    .innerJoin(documents, eq(documents.id, document_chunks.documentId))
    .where(eq(document_chunks.id, params.id))
    .limit(1);

  if (!chunk) return json({ message: "Chunk not found." }, { status: 404 });
  return json(chunk);
};
