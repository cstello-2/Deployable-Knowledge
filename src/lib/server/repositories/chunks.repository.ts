import { and, count, eq } from 'drizzle-orm';
import { databaseClient, db } from '$lib/server/database/database';
import {
	documentChunks,
	documents,
	type Document,
	type DocumentChunk
} from '$lib/server/database/schema';

export type ChunkWindowChunk = {
	chunkId: string;
	position: number;
	pageIndex: number;
	chunkIndex: number;
	chunkType: DocumentChunk['chunkType'];
	content: string;
};

export type ChunkWindow = {
	document: { id: string; title: string; sourceType: Document['sourceType'] };
	totalChunks: number;
	start: number;
	end: number;
	chunks: ChunkWindowChunk[];
};

export class ChunksRepository {
	static async window(
		documentId: string,
		start: number,
		maxCount: number
	): Promise<ChunkWindow | null> {
		const document = await db
			.select({
				id: documents.id,
				title: documents.title,
				sourceType: documents.sourceType
			})
			.from(documents)
			.where(and(eq(documents.id, documentId), eq(documents.active, true)))
			.get();

		if (!document) return null;

		const totals = await db
			.select({ total: count() })
			.from(documentChunks)
			.where(eq(documentChunks.documentId, documentId))
			.get();
		const totalChunks = totals?.total ?? 0;

		if (totalChunks === 0) {
			return { document, totalChunks: 0, start: 0, end: 0, chunks: [] };
		}

		const clampedStart = Math.min(Math.max(1, Math.floor(start)), totalChunks);
		const clampedEnd = Math.min(clampedStart + Math.max(1, Math.floor(maxCount)) - 1, totalChunks);

		const result = await databaseClient.execute({
			sql: `SELECT chunkId, position, pageIndex, chunkIndex, chunkType, content FROM (
					SELECT
						dc.id AS chunkId,
						dc.page_index AS pageIndex,
						dc.chunk_index AS chunkIndex,
						dc.chunk_type AS chunkType,
						dc.content AS content,
						ROW_NUMBER() OVER (ORDER BY dc.page_index, dc.chunk_index) AS position
					FROM document_chunks dc
					WHERE dc.document_id = ?
				)
				WHERE position BETWEEN ? AND ?
				ORDER BY position`,
			args: [documentId, clampedStart, clampedEnd]
		});

		const chunks = result.rows.map((row) => ({
			chunkId: String(row.chunkId),
			position: Number(row.position),
			pageIndex: Number(row.pageIndex),
			chunkIndex: Number(row.chunkIndex),
			chunkType: String(row.chunkType) as DocumentChunk['chunkType'],
			content: String(row.content)
		}));

		return { document, totalChunks, start: clampedStart, end: clampedEnd, chunks };
	}
}
