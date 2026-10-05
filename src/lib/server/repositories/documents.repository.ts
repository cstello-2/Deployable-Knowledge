import {
	and,
	asc,
	count,
	desc,
	eq,
	exists,
	inArray,
	or,
	sql,
	type Column,
	type SQL
} from 'drizzle-orm';
import type {
	ApiDocumentListQuery,
	ApiDocumentListResponse,
	ApiTranscriptResponse,
	DocumentRow,
	DocumentSortMode
} from '$lib/types';
import { db } from '$lib/server/database/database';
import { documentChunks, documentTags, documents, syncedFiles } from '$lib/server/database/schema';

function likePattern(token: string): string {
	return `%${token.replace(/[\\%_]/g, '\\$&')}%`;
}

function likeContains(column: Column, token: string): SQL {
	return sql`${column} LIKE ${likePattern(token)} ESCAPE '\\'`;
}

function hasTagIn(values: string[]): SQL {
	return exists(
		db
			.select({ one: sql`1` })
			.from(documentTags)
			.where(and(eq(documentTags.documentId, documents.id), inArray(documentTags.tag, values)))
	);
}

function hasTagLike(token: string): SQL {
	return exists(
		db
			.select({ one: sql`1` })
			.from(documentTags)
			.where(and(eq(documentTags.documentId, documents.id), likeContains(documentTags.tag, token)))
	);
}

// At most one synced row carries a document's id, so this join never repeats a document.
const ownedByFolder = eq(syncedFiles.documentId, documents.id);

// Requires the `ownedByFolder` join.
const documentGroup = sql<string>`coalesce(${syncedFiles.folderId}, case ${documents.origin} when 'MANUAL' then 'manual' else 'individual' end)`;

function listConditions({
	group,
	mode,
	query,
	tags: tagFilter
}: ApiDocumentListQuery): SQL | undefined {
	const conditions: SQL[] = [];
	if (group) conditions.push(eq(documentGroup, group));
	if (mode === 'active') conditions.push(eq(documents.active, true));
	if (mode === 'inactive') conditions.push(eq(documents.active, false));
	if (tagFilter?.length) conditions.push(hasTagIn(tagFilter));
	for (const token of query?.trim().split(/\s+/).filter(Boolean) ?? []) {
		conditions.push(or(likeContains(documents.title, token), hasTagLike(token))!);
	}
	return conditions.length ? and(...conditions) : undefined;
}

const chunkTotal = sql`(select count(*) from ${documentChunks} where ${documentChunks.documentId} = ${documents.id})`;

function orderFor(sort: DocumentSortMode | undefined): SQL[] {
	const byTitle = sql`${documents.title} COLLATE NOCASE`;
	switch (sort) {
		case 'title-desc':
			return [desc(byTitle)];
		case 'oldest':
			return [asc(documents.createdAt)];
		case 'most-chunks':
			return [desc(chunkTotal)];
		case 'least-chunks':
			return [asc(chunkTotal)];
		case 'newest':
			return [desc(documents.createdAt)];
		default:
			return [asc(byTitle)];
	}
}

export class DocumentsRepository {
	static async listIds(options: ApiDocumentListQuery = {}): Promise<string[]> {
		const rows = await db
			.select({ id: documents.id })
			.from(documents)
			.leftJoin(syncedFiles, ownedByFolder)
			.where(listConditions(options));
		return rows.map(({ id }) => id);
	}

	static async list(options: ApiDocumentListQuery = {}): Promise<ApiDocumentListResponse> {
		const where = listConditions(options);
		const ordering = orderFor(options.sort);

		const page = db
			.select({
				id: documents.id,
				title: documents.title,
				sourcePath: documents.sourcePath,
				sourceType: documents.sourceType,
				origin: documents.origin,
				createdAt: documents.createdAt,
				updatedAt: documents.updatedAt,
				active: documents.active,
				folderId: syncedFiles.folderId
			})
			.from(documents)
			.leftJoin(syncedFiles, ownedByFolder)
			.where(where)
			.orderBy(...ordering, asc(documents.id));

		const [rows, [{ total }]] = await Promise.all([
			options.limit === undefined ? page : page.limit(options.limit).offset(options.offset ?? 0),
			db
				.select({ total: count() })
				.from(documents)
				.leftJoin(syncedFiles, ownedByFolder)
				.where(where)
		]);

		const documentIds = rows.map(({ id }) => id);
		const [tagRows, chunkRows] = documentIds.length
			? await Promise.all([
					db
						.select({ documentId: documentTags.documentId, tag: documentTags.tag })
						.from(documentTags)
						.where(inArray(documentTags.documentId, documentIds))
						.orderBy(asc(documentTags.tag)),
					db
						.select({ documentId: documentChunks.documentId, total: count() })
						.from(documentChunks)
						.where(inArray(documentChunks.documentId, documentIds))
						.groupBy(documentChunks.documentId)
				])
			: [[], []];

		const tagsByDocument = new Map<string, string[]>();

		for (const row of tagRows) {
			const values = tagsByDocument.get(row.documentId) ?? [];
			values.push(row.tag);
			tagsByDocument.set(row.documentId, values);
		}

		const chunkCountByDocument = new Map(chunkRows.map((row) => [row.documentId, row.total]));

		const documentRows: DocumentRow[] = rows.map((row) => ({
			...row,
			chunkCount: chunkCountByDocument.get(row.id) ?? 0,
			tags: tagsByDocument.get(row.id) ?? []
		}));
		return { documents: documentRows, total };
	}

	static async titles(
		options: { documentIds?: string[]; limit?: number; offset?: number } = {}
	): Promise<{
		total: number;
		documents: Pick<DocumentRow, 'id' | 'title' | 'sourceType' | 'sourcePath'>[];
	}> {
		const conditions: SQL[] = [eq(documents.active, true)];
		if (options.documentIds?.length) conditions.push(inArray(documents.id, options.documentIds));
		const where = and(...conditions);

		const page = db
			.select({
				id: documents.id,
				title: documents.title,
				sourceType: documents.sourceType,
				sourcePath: documents.sourcePath
			})
			.from(documents)
			.where(where)
			.orderBy(asc(sql`${documents.title} COLLATE NOCASE`), asc(documents.id));

		const [rows, [{ total }]] = await Promise.all([
			options.limit === undefined ? page : page.limit(options.limit).offset(options.offset ?? 0),
			db.select({ total: count() }).from(documents).where(where)
		]);

		return { total, documents: rows };
	}

	static async files(
		options: { documentIds?: string[] } = {}
	): Promise<Pick<DocumentRow, 'id' | 'title' | 'sourceType' | 'sourcePath'>[]> {
		const conditions: SQL[] = [eq(documents.active, true)];
		if (options.documentIds?.length) conditions.push(inArray(documents.id, options.documentIds));

		return db
			.select({
				id: documents.id,
				title: documents.title,
				sourceType: documents.sourceType,
				sourcePath: documents.sourcePath
			})
			.from(documents)
			.where(and(...conditions))
			.orderBy(asc(sql`${documents.title} COLLATE NOCASE`), asc(documents.id));
	}

	static async transcript(documentId: string): Promise<ApiTranscriptResponse | null> {
		const [document] = await db
			.select({
				id: documents.id,
				title: documents.title,
				sourcePath: documents.sourcePath,
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
