import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { count, eq } from 'drizzle-orm';
import type { ApiDocumentIngestProgress, ApiDocumentIngestResult } from '$lib/types';
import { db } from '$lib/server/database/database';
import {
	document_chunks as documentChunks,
	documents,
	synced_files as syncedFiles
} from '$lib/server/database/schema';
import { ingestDocument } from '$lib/server/rag/ingest-document';
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

export async function ingestPdfPath(
	filePath: string,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	const root = await realpath(homedir());
	const path = await realpath(resolve(filePath));
	const fileStats = await stat(path);
	if (!containsPath(root, path) || !fileStats.isFile()) {
		throw new Error('Select a PDF file inside your home folder.');
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

	return ingestPdfBuffer(basename(path), await readFile(path), onProgress);
}
