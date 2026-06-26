import { json } from "@sveltejs/kit";
import { databaseClient } from "$lib/server/database/database";
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
  const rows = await databaseClient.execute(`
    select
      d.id as id,
      d.title as title,
      d.source_path as sourcePath,
      d.source_type as sourceType,
      d.updated_at as updatedAt,
      count(dc.id) as chunkCount
    from documents d
    left join document_chunks dc on dc.document_id = d.id
    group by d.id
    order by d.updated_at desc
  `);

  return json({
    documents: rows.rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      sourcePath: String(row.sourcePath),
      sourceType: String(row.sourceType),
      updatedAt: String(row.updatedAt),
      chunkCount: Number(row.chunkCount ?? 0),
    })) satisfies DocumentListRow[],
  });
};
