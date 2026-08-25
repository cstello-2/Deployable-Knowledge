import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { count, eq } from 'drizzle-orm';
import type { ApiDocumentIngestProgress, ApiDocumentIngestResult } from '$lib/types';
import { db } from '$lib/server/database/database';
import { documentChunks, documents, syncedFiles } from '$lib/server/database/schema';
import { ingestDocument } from '$lib/server/rag/ingest-document';
import { fetchYoutubeTranscript } from '$lib/server/youtube/transcript-client';
import { parseYoutubeVideoId, watchUrl } from '$lib/utils';
import {
	handlerForPath,
	handlerForType,
	SOURCE_TYPE_HANDLERS,
	type SourceTypeHandler
} from './source-types';
import { managedExtensionFor, writeManagedArtifacts } from './managed-artifacts';
import { containsPath, removeManagedDocumentFile } from './remove-document';

const DOCUMENTS_DIR = 'documents';
// Handlers only need the leading bytes to recognize a format
const VALIDATION_HEADER_BYTES = 8192;

// Hash without loading the file into memory; corpus files can be far larger than the heap
export async function hashFileContents(path: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) {
		hash.update(chunk as Buffer);
	}
	return hash.digest('hex');
}

export function managedPathForHash(contentHash: string, extension: string): string {
	return join(DOCUMENTS_DIR, `${contentHash.slice(0, 16)}${extension}`);
}

async function readFileHeader(path: string, size: number): Promise<Buffer> {
	const handle = await open(path, 'r');
	try {
		const headerSize = Math.min(size, VALIDATION_HEADER_BYTES);
		const { buffer, bytesRead } = await handle.read(Buffer.alloc(headerSize), 0, headerSize, 0);
		return buffer.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

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

	// Converted artifacts need the original bytes in memory; those formats stay small
	if (handler.convert || handler.preview) {
		return ingestFileBuffer(basename(path), await readFile(path), onProgress);
	}

	handler.validateFile?.({ path, size: fileStats.size });
	handler.validateBuffer?.(await readFileHeader(path, fileStats.size));

	await mkdir(DOCUMENTS_DIR, { recursive: true });
	const savedPath = managedPathForHash(
		await hashFileContents(path),
		managedExtensionFor(handler, path)
	);
	const existing = await existingDocument(savedPath);
	if (existing) return existing;

	await copyFile(path, savedPath);
	try {
		return await ingestDocument(
			{ filePath: savedPath, title: titleFor(path), sourceType: handler.type },
			onProgress
		);
	} catch (error) {
		await removeManagedDocumentFile(savedPath);
		throw error;
	}
}
