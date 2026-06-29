import { json } from "@sveltejs/kit";
import { count, desc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import { document_chunks, documents } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

type DocumentListRow = {
  id: string;
  title: string;
  sourcePath: string;
  sourceType: string;
  updatedAt: string;
  chunkCount: number;
};

export const GET: RequestHandler = async () => {
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      sourcePath: documents.sourcePath,
      sourceType: documents.sourceType,
      updatedAt: documents.updatedAt,
      chunkCount: count(document_chunks.id),
    })
    .from(documents)
    .leftJoin(document_chunks, eq(document_chunks.documentId, documents.id))
    .groupBy(documents.id)
    .orderBy(desc(documents.updatedAt));

  return json({
    documents: rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      sourcePath: String(row.sourcePath),
      sourceType: String(row.sourceType),
      updatedAt: String(row.updatedAt),
      chunkCount: Number(row.chunkCount ?? 0),
    })) satisfies DocumentListRow[],
  });
};
