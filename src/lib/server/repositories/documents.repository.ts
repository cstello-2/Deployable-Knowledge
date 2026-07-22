import { asc, count, desc, eq } from 'drizzle-orm';
import type { ApiDocumentListResponse, DocumentRow } from '$lib/types';
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
		const rows = await db
			.select({
				id: documents.id,
				title: documents.title,
				sourcePath: documents.sourcePath,
				sourceType: documents.sourceType,
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
}
