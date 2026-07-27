import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { count, eq } from 'drizzle-orm';
import type { ApiDocumentIngestProgress, ApiDocumentIngestResult } from '$lib/types';
import { db } from '$lib/server/database/database';
import { documentChunks, documents, syncedFiles } from '$lib/server/database/schema';
import { ingestDocument } from '$lib/server/rag/ingest-document';
import { isSupportedAudioPath } from '$lib/utils';
import { containsPath, removeManagedDocumentFile } from './remove-document';

const DOCUMENTS_DIR = 'documents';
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

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

export async function ingestPdfBuffer(
	originalName: string,
	buffer: Buffer,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	if (
		!originalName.toLowerCase().endsWith('.pdf') ||
		buffer.subarray(0, 5).toString() !== '%PDF-'
	) {
		throw new Error('Only PDF uploads are supported.');
	}

	await mkdir(DOCUMENTS_DIR, { recursive: true });
	const contentHash = createHash('sha256').update(buffer).digest('hex');
	const savedPath = join(DOCUMENTS_DIR, `${contentHash.slice(0, 16)}.pdf`);
	const existing = await existingDocument(savedPath);
	if (existing) return existing;

	await writeFile(savedPath, buffer);
	try {
		return await ingestDocument(
			{
				filePath: savedPath,
				title: originalName.replace(/\.pdf$/i, '').trim() || originalName
			},
			onProgress
		);
	} catch (error) {
		await removeManagedDocumentFile(savedPath);
		throw error;
	}
}

// Audio stays where the user keeps it; the transcript chunks are the ingested artifact
async function ingestAudioPath(
	path: string,
	byteLength: number,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	if (byteLength === 0) throw new Error('The audio file is empty.');
	if (byteLength > MAX_AUDIO_BYTES) throw new Error('Audio files must be 100 MB or smaller.');

	// Transcription is slow, so a file that already has a transcript keeps the stored one
	const existing = await existingDocument(path);
	if (existing) return existing;

	const extension = extname(path);
	return ingestDocument({ filePath: path, title: basename(path, extension) }, onProgress);
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

	if (isSupportedAudioPath(path)) return ingestAudioPath(path, fileStats.size, onProgress);

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

	return ingestPdfBuffer(basename(path), await readFile(path), onProgress);
}
