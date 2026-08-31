import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { count, eq } from 'drizzle-orm';
import type { ApiDocumentIngestProgress, ApiDocumentIngestResult } from '$lib/types';
import { db } from '$lib/server/database/database';
import { documentChunks, documents } from '$lib/server/database/schema';
import { ingestDocument } from '$lib/server/rag/ingest-document';
import { fetchYoutubeTranscript } from '$lib/server/youtube/transcript-client';
import { parseYoutubeVideoId, watchUrl } from '$lib/utils';
import { handlerForPath, handlerForType } from './source-types';
import { managedExtensionFor, writeManagedArtifacts } from './managed-artifacts';
import { removeManagedDocumentFile } from './remove-document';

const DOCUMENTS_DIR = 'documents';

export function managedPathForHash(contentHash: string, extension: string): string {
	return join(DOCUMENTS_DIR, `${contentHash.slice(0, 16)}${extension}`);
}

export async function existingDocument(
	sourcePath: string
): Promise<ApiDocumentIngestResult | null> {
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

export function titleFor(name: string): string {
	return basename(name, extname(name)).trim() || name;
}

export async function ingestFileBuffer(
	originalName: string,
	buffer: Buffer,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	const handler = handlerForPath(originalName);
	if (!handler) throw new Error('Unsupported document type.');
	handler.validateFile?.({ path: originalName, size: buffer.byteLength });
	handler.validateBuffer?.(buffer);

	await mkdir(DOCUMENTS_DIR, { recursive: true });
	const contentHash = createHash('sha256').update(buffer).digest('hex');
	const savedPath = managedPathForHash(contentHash, managedExtensionFor(handler, originalName));
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

const MAX_MANUAL_TITLE_LENGTH = 200;

// Text pasted straight into the UI; stored as a managed Markdown file so preview,
// re-ingest, and removal work exactly like uploaded documents.
export async function ingestTextContent(
	title: string,
	content: string,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	const cleanTitle = title.replace(/\s+/g, ' ').trim().slice(0, MAX_MANUAL_TITLE_LENGTH);
	if (!cleanTitle) throw new Error('Give the text a title.');
	if (!content.trim()) throw new Error('Provide text to embed.');

	const handler = handlerForType('TEXT');
	const buffer = Buffer.from(content, 'utf8');
	handler?.validateBuffer?.(buffer);

	await mkdir(DOCUMENTS_DIR, { recursive: true });
	const contentHash = createHash('sha256').update(buffer).digest('hex');
	const savedPath = managedPathForHash(contentHash, '.md');
	const existing = await existingDocument(savedPath);
	if (existing) return existing;

	await writeFile(savedPath, buffer);
	try {
		const result = await ingestDocument(
			{ filePath: savedPath, title: cleanTitle, sourceType: 'TEXT' },
			onProgress
		);
		await db.update(documents).set({ origin: 'MANUAL' }).where(eq(documents.id, result.documentId));
		return result;
	} catch (error) {
		await removeManagedDocumentFile(savedPath);
		throw error;
	}
}

export async function ingestYoutubeUrl(
	url: string,
	onProgress?: (progress: ApiDocumentIngestProgress) => void
): Promise<ApiDocumentIngestResult> {
	const videoId = parseYoutubeVideoId(url);
	if (!videoId) throw new Error('Enter a YouTube video link.');

	const canonicalUrl = watchUrl(videoId);

	const existing = await existingDocument(canonicalUrl);
	if (existing) return existing;

	const { title } = await fetchYoutubeTranscript(videoId);

	const result = await ingestDocument(
		{ filePath: canonicalUrl, title, sourceType: 'YOUTUBE' },
		onProgress
	);
	await db.update(documents).set({ origin: 'MANUAL' }).where(eq(documents.id, result.documentId));
	return result;
}
