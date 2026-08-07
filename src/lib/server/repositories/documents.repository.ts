import { asc, count, desc, eq } from 'drizzle-orm';
import type { ApiDocumentListResponse, ApiTranscriptResponse, DocumentRow } from '$lib/types';
import { db } from '$lib/server/database/database';
import {
	documentChunks,
	documentTags,
	documents,
	syncedFiles,
	tags
} from '$lib/server/database/schema';

export class DocumentsRepository {
	static async list(): Promise<ApiDocumentListResponse> {
		// createdAt is needed for the Newest/Oldest sort options, wasn't
		// being selected here before
		const rows = await db
			.select({
				id: documents.id,
				title: documents.title,
				sourcePath: documents.sourcePath,
				sourceType: documents.sourceType,
				createdAt: documents.createdAt,
				updatedAt: documents.updatedAt,
				active: documents.active,
				chunkCount: count(documentChunks.id),
				folderId: syncedFiles.folderId
			})
			.from(documents)
			.leftJoin(documentChunks, eq(documentChunks.documentId, documents.id))
			.leftJoin(syncedFiles, eq(syncedFiles.documentId, documents.id))
			.groupBy(documents.id)
			.orderBy(desc(documents.updatedAt));

		const [tagRows, availableTags] = await Promise.all([
			db
				.select({ documentId: documentTags.documentId, tag: documentTags.tag })
				.from(documentTags)
				.orderBy(asc(documentTags.tag)),
			db.select({ name: tags.name }).from(tags).orderBy(asc(tags.name))
		]);

		const tagsByDocument = new Map<string, string[]>();

		for (const row of tagRows) {
			const values = tagsByDocument.get(row.documentId) ?? [];
			values.push(row.tag);
			tagsByDocument.set(row.documentId, values);
		}

		const documentRows: DocumentRow[] = rows.map((row) => ({
			...row,
			folderId: row.folderId ?? null,
			tags: tagsByDocument.get(row.id) ?? []
		}));
		return { documents: documentRows, tags: availableTags.map(({ name }) => name) };
	}

	static async transcript(documentId: string): Promise<ApiTranscriptResponse | null> {
		const [document] = await db
			.select({
				id: documents.id,
				title: documents.title,
				sourceType: documents.sourceType,
				updatedAt: documents.updatedAt
			})
			.from(documents)
			.where(eq(documents.id, documentId))
			.limit(1);

		if (!document) return null;

		const chunks = await db
			.select({
				id: documentChunks.id,
				chunkIndex: documentChunks.chunkIndex,
				content: documentChunks.content,
				startMs: documentChunks.startMs,
				endMs: documentChunks.endMs
			})
			.from(documentChunks)
			.where(eq(documentChunks.documentId, documentId))
			.orderBy(asc(documentChunks.chunkIndex));

		return { chunks, document };
	}
}
