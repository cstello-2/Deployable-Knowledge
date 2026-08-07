import type { AgentTool } from './types';
import { createToolResult, sourceOutput } from './result';
import { clampInteger, clampText, compactText, readObject } from '../utils/values';
import { ChunksRepository, type ChunkWindow } from '../repositories/chunks.repository';
import { describeChunkLocation } from '../rag/search/retrieve-rag-context';
import { RAG_CHUNK_CHARACTER_LIMIT } from '$lib/constants';

const MAX_WINDOW_CHUNKS = 8;
const DEFAULT_WINDOW_CHUNKS = 4;
const MAX_PREVIEW_CHARS = 200;

type ReadChunksData = {
	documentId: string;
	title: string;
	totalChunks: number;
	start: number;
	end: number;
	chunks: {
		position: number;
		pageIndex: number;
		chunkType: string;
		content: string;
	}[];
	note: string;
};

function buildChunkSources(window: ChunkWindow) {
	return window.chunks.map((chunk) => {
		const preview = compactText(chunk.content, MAX_PREVIEW_CHARS);

		return {
			title: window.document.title,
			description: describeChunkLocation(window.document.sourceType, chunk.pageIndex, preview),
			documentId: window.document.id,
			chunkId: chunk.chunkId,
			sourceType: window.document.sourceType,
			pageIndex: chunk.pageIndex,
			chunkIndex: chunk.chunkIndex,
			position: chunk.position,
			totalChunks: window.totalChunks
		};
	});
}

export const readChunksTool: AgentTool<ReadChunksData> = {
	id: 'read_chunks',
	label: 'Read document chunks',
	description: 'Reads a contiguous range of chunks from a document in reading order.',
	modes: ['document'],
	instructions: `DOCUMENT READING POLICY:
- read_chunks returns the stored chunks of one document in reading order, addressed by 1-based position (1 is the first chunk; totalChunks is the last).
- Search results include documentId, position, and totalChunks for every chunk they return. To see the text surrounding a promising search result, request ONE window around its position in a single call (for example start = position - 2, end = position + 3). At most ${MAX_WINDOW_CHUNKS} chunks are returned per call; out-of-range positions are clamped into 1..totalChunks.
- Never page through a document chunk by chunk. If two windows from the same document have not answered the question, stop reading that document and go back to the search tool with different keywords or a different searchType instead.
- If a window's content is irrelevant filler (file listings, tables of contents, boilerplate), do not keep reading neighboring chunks — search elsewhere.
- read_chunks does not search. Use the search tool first to find relevant documents and positions; use read_chunks only with documentId values taken from search results in this conversation.`,
	definition: {
		description:
			"Read a contiguous range of chunks from one document in reading order. Positions are 1-based document-wide ordinals: search results report each chunk's position and the document's totalChunks. Use this after search to read the text before and after a relevant result, or to step through a section of a document.",
		parameters: {
			type: 'object',
			properties: {
				document_id: {
					type: 'string',
					description: 'The documentId of the document to read, taken from a search result.'
				},
				start: {
					type: 'integer',
					description: 'First chunk position to read. 1 is the first chunk of the document.'
				},
				end: {
					type: 'integer',
					description: `Optional last position, inclusive. Defaults to a ${DEFAULT_WINDOW_CHUNKS}-chunk window starting at start. At most ${MAX_WINDOW_CHUNKS} chunks are returned per call.`
				}
			},
			required: ['document_id', 'start'],
			additionalProperties: false
		}
	},

	async execute(argumentsValue, context) {
		const args = readObject(argumentsValue);
		const documentId = clampText(args.document_id ?? args.documentId, 200);

		if (!documentId) {
			throw new Error('read_chunks requires document_id from a search result');
		}

		const allowedDocuments = context.documentIds;
		if (
			Array.isArray(allowedDocuments) &&
			allowedDocuments.length > 0 &&
			!allowedDocuments.includes(documentId)
		) {
			throw new Error('read_chunks: document is not in the current chat selection');
		}

		const start = clampInteger(args.start, 1, 1_000_000, 1);
		const end = clampInteger(
			args.end,
			start,
			start + MAX_WINDOW_CHUNKS - 1,
			start + DEFAULT_WINDOW_CHUNKS - 1
		);

		const window = await ChunksRepository.window(documentId, start, end - start + 1);
		if (!window) {
			throw new Error('read_chunks: unknown or inactive document');
		}

		const data: ReadChunksData = {
			documentId: window.document.id,
			title: window.document.title,
			totalChunks: window.totalChunks,
			start: window.start,
			end: window.end,
			chunks: window.chunks.map((chunk) => ({
				position: chunk.position,
				pageIndex: chunk.pageIndex,
				chunkType: chunk.chunkType,
				content: compactText(chunk.content, RAG_CHUNK_CHARACTER_LIMIT)
			})),
			note: 'positions run 1..totalChunks in reading order'
		};

		return createToolResult(data, {
			outputs: buildChunkSources(window).map(sourceOutput)
		});
	}
};
