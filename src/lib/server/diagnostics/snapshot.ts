import { count, eq } from 'drizzle-orm';
import packageMetadata from '../../../../package.json';
import type { ApiDiagnosticsSnapshot } from '$lib/types';
import { databaseClient, db } from '$lib/server/database/database';
import {
	documentChunks,
	documents,
	notebookPages,
	notebooks,
	sessionMessages,
	sessions,
	syncedFolders
} from '$lib/server/database/schema';
import { isEmbeddingModelInstalled } from '$lib/server/rag/embedding-model';

const EMPTY_COUNTS: ApiDiagnosticsSnapshot['counts'] = {
	activeDocuments: null,
	chunks: null,
	documents: null,
	messages: null,
	notebookPages: null,
	notebooks: null,
	sessions: null,
	syncedFolders: null
};

export async function buildDiagnosticsSnapshot(): Promise<ApiDiagnosticsSnapshot> {
	let counts = { ...EMPTY_COUNTS };
	let database: ApiDiagnosticsSnapshot['health']['database'] = 'unavailable';
	let searchIndex: ApiDiagnosticsSnapshot['health']['searchIndex'] = 'unavailable';

	try {
		await databaseClient.execute('SELECT 1');

		const [
			[{ value: documentCount }],
			[{ value: activeDocumentCount }],
			[{ value: chunkCount }],
			[{ value: sessionCount }],
			[{ value: messageCount }],
			[{ value: notebookCount }],
			[{ value: notebookPageCount }],
			[{ value: syncedFolderCount }]
		] = await Promise.all([
			db.select({ value: count() }).from(documents),
			db.select({ value: count() }).from(documents).where(eq(documents.active, true)),
			db.select({ value: count() }).from(documentChunks),
			db.select({ value: count() }).from(sessions),
			db.select({ value: count() }).from(sessionMessages),
			db.select({ value: count() }).from(notebooks),
			db.select({ value: count() }).from(notebookPages),
			db.select({ value: count() }).from(syncedFolders)
		]);

		counts = {
			activeDocuments: activeDocumentCount,
			chunks: chunkCount,
			documents: documentCount,
			messages: messageCount,
			notebookPages: notebookPageCount,
			notebooks: notebookCount,
			sessions: sessionCount,
			syncedFolders: syncedFolderCount
		};
		database = 'healthy';

		try {
			const result = await databaseClient.execute(`
				SELECT
					(SELECT count(*) FROM chunk_fts_docsize) AS indexed,
					(SELECT count(*) FROM document_chunks) AS stored
			`);
			const row = result.rows[0] as unknown as { indexed: number; stored: number };
			searchIndex = row.indexed === row.stored ? 'ready' : 'out-of-sync';
		} catch {
			searchIndex = 'unavailable';
		}
	} catch {
		// The report remains usable when the database is unavailable.
	}

	let embeddingModel: ApiDiagnosticsSnapshot['health']['embeddingModel'] = 'unavailable';
	try {
		embeddingModel = (await isEmbeddingModelInstalled()) ? 'installed' : 'missing';
	} catch {
		// Leave it unavailable.
	}

	return {
		application: {
			memoryBytes: process.memoryUsage().rss,
			runtimeMode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
			uptimeSeconds: Math.floor(process.uptime()),
			version: packageMetadata.version
		},
		counts,
		generatedAt: new Date().toISOString(),
		health: {
			database,
			embeddingModel,
			searchIndex
		}
	};
}
