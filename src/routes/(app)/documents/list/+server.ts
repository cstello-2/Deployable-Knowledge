import { json } from "@sveltejs/kit";
import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "$lib/server/database/database";
import {
  document_chunks,
  document_tags,
  documents,
  synced_files,
  tags,
} from "$lib/server/database/schema";
import type { Document } from "$lib/server/database/schema";
import type { RequestHandler } from "./$types";

type DocumentListRow = Pick<
  Document,
  "id" | "title" | "sourcePath" | "sourceType" | "updatedAt"
> & {
  chunkCount: number;
  tags: string[];
  folderId: string | null;
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
      folderId: synced_files.folderId,
    })
    .from(documents)
    .leftJoin(document_chunks, eq(document_chunks.documentId, documents.id))
    .leftJoin(synced_files, eq(synced_files.documentId, documents.id))
    .groupBy(documents.id)
    .orderBy(desc(documents.updatedAt));

  const [tagRows, availableTagRows] = await Promise.all([
    db
      .select({ documentId: document_tags.documentId, tag: document_tags.tag })
      .from(document_tags)
      .orderBy(asc(document_tags.tag)),
    db.select({ name: tags.name }).from(tags).orderBy(asc(tags.name)),
  ]);

  const tagsByDocument = new Map<string, string[]>();

  for (const row of tagRows) {
    const documentTags = tagsByDocument.get(row.documentId) ?? [];
    documentTags.push(row.tag);
    tagsByDocument.set(row.documentId, documentTags);
  }

  return json({
    documents: rows.map((row) => ({
      id: row.id,
      title: row.title,
      sourcePath: row.sourcePath,
      sourceType: row.sourceType,
      updatedAt: row.updatedAt,
      chunkCount: row.chunkCount,
      tags: tagsByDocument.get(row.id) ?? [],
      folderId: row.folderId ?? null,
    })) satisfies DocumentListRow[],
    tags: availableTagRows.map((row) => row.name),
  });
};
