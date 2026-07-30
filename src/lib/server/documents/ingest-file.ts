import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { count, eq } from 'drizzle-orm';
import type { ApiDocumentIngestProgress, ApiDocumentIngestResult } from '$lib/types';
import { db } from '$lib/server/database/database';
import { documentChunks, documents, syncedFiles } from '$lib/server/database/schema';
import { ingestDocument } from '$lib/server/rag/ingest-document';
import { handlerForPath, SOURCE_TYPE_HANDLERS, type SourceTypeHandler } from './source-types';
import { managedExtensionFor, writeManagedArtifacts } from './managed-artifacts';
import { containsPath, removeManagedDocumentFile } from './remove-document';

const DOCUMENTS_DIR = 'documents';

async function existingDocument(sourcePath: string): Promise<ApiDocumentIngestResult | null> {
	const [existing] = await db
		.select({
			documentId: documents.id,
			title: documents.title,
			sourcePath: documents.sourcePath,
			chunkCount: count(documentChunks.id)
		})
		.from(documents)
		.leftJoin(documentChunks, eq(documentChunks.documentId, documents.id))
		.where(eq(documents.sourcePath, sourcePath))
		.groupBy(documents.id)
		.limit(1);
	return existing ? { ...existing, pageCount: 0, chunkCount: Number(existing.chunkCount) } : null;
}

function titleFor(name: string): string {
	return basename(name, extname(name)).trim() || name;
}

export async function ingestFileBuffer(
	originalName: string,
	buffer: Buffer,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	const handler = handlerForPath(originalName);

	// Uploads land in the managed documents folder, so in-place formats need a real path
	if (handler?.storage !== 'managed-copy') {
		const supported = SOURCE_TYPE_HANDLERS.filter((entry) => entry.storage === 'managed-copy')
			.map((entry) => entry.type)
			.join(', ');
		throw new Error(`Only ${supported} uploads are supported.`);
	}
	handler.validateBuffer?.(buffer);

	await mkdir(DOCUMENTS_DIR, { recursive: true });
	const contentHash = createHash('sha256').update(buffer).digest('hex');
	const savedPath = join(
		DOCUMENTS_DIR,
		`${contentHash.slice(0, 16)}${managedExtensionFor(handler, originalName)}`
	);
	const existing = await existingDocument(savedPath);
	if (existing) return existing;

	if (handler.convert) {
		onProgress?.({ percent: 0, label: handler.progressLabel, message: handler.startMessage });
	}
	await writeManagedArtifacts(handler, buffer, savedPath);
	try {
		return await ingestDocument(
			{ filePath: savedPath, title: titleFor(originalName), sourceType: handler.type },
			onProgress
		);
	} catch (error) {
		await removeManagedDocumentFile(savedPath);
		throw error;
	}
}

// In-place sources stay where the user keeps them; the chunks are the ingested artifact
async function ingestInPlace(
	handler: SourceTypeHandler,
	path: string,
	byteLength: number,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	handler.validateFile?.({ path, size: byteLength });

	// Extraction is slow (e.g. transcription), so a file that already has chunks keeps the stored ones
	const existing = await existingDocument(path);
	if (existing) return existing;

	return ingestDocument({ filePath: path, title: titleFor(path) }, onProgress);
}

export async function ingestFilePath(
	filePath: string,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	const root = await realpath(homedir());
	const path = await realpath(resolve(filePath));
	const fileStats = await stat(path);

	if (!containsPath(root, path) || !fileStats.isFile()) {
		throw new Error('Select a file inside your home folder.');
	}

	const handler = handlerForPath(path);
	if (!handler) throw new Error('Unsupported document type.');
	if (handler.storage === 'in-place') {
		return ingestInPlace(handler, path, fileStats.size, onProgress);
	}

	const [tracked] = await db
		.select({ sourcePath: documents.sourcePath })
		.from(syncedFiles)
		.innerJoin(documents, eq(documents.id, syncedFiles.documentId))
		.where(eq(syncedFiles.sourcePath, path))
		.limit(1);

	if (tracked) {
		const existing = await existingDocument(tracked.sourcePath);
		if (existing) return existing;
	}

	return ingestFileBuffer(basename(path), await readFile(path), onProgress);
}
