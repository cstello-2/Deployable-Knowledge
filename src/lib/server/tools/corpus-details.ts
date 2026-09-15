import type { AgentTool } from './types';
import { createToolResult } from './result';
import { clampInteger, readObject } from '../utils/values';
import { DocumentsRepository } from '../repositories/documents.repository';
import { pythonDocumentPath } from '../documents/python-path';

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 100;

type CorpusDetailsData = {
	totalDocuments: number;
	offset: number;
	returned: number;
	documents: {
		documentId: string;
		documentPath: string | null;
		title: string;
		sourceType: string;
	}[];
	note: string;
};

export const corpusDetailsTool: AgentTool<CorpusDetailsData> = {
	id: 'corpus_details',
	label: 'Corpus details',
	description: 'Lists corpus documents with their titles and paths for Python.',
	modes: ['document', 'notebook'],
	instructions: `CORPUS DETAILS POLICY:
- corpus_details reports what the corpus contains — the document count and document titles — not what the documents say. Use it when the user asks what documents exist, how many there are, or which documents are available.
- Use the returned path to read a CSV with Python. A null path means the source has no managed file available to Python. Use search for document excerpts and Python for calculations over CSV data.
- Titles are returned alphabetically in pages of at most ${MAX_PAGE_SIZE}. When totalDocuments is larger than offset + returned, call again with offset advanced past the titles already seen; only claim a complete list after every page has been read.`,
	definition: {
		description:
			'List documents available in this chat: the total count, titles, source types, and read-only paths for Python, in alphabetical order. Use this to find a CSV path before analyzing it with Python. It does not search document content.',
		parameters: {
			type: 'object',
			properties: {
				offset: {
					type: 'integer',
					minimum: 0,
					description: 'Number of titles to skip, for paging through a large corpus. Defaults to 0.'
				},
				limit: {
					type: 'integer',
					minimum: 1,
					maximum: MAX_PAGE_SIZE,
					description: `Maximum number of titles to return per call. Defaults to ${DEFAULT_PAGE_SIZE}.`
				}
			},
			additionalProperties: false
		}
	},

	async execute(argumentsValue, context) {
		const args = readObject(argumentsValue);
		const offset = clampInteger(args.offset, 0, 1_000_000, 0);
		const limit = clampInteger(args.limit, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
		const documentIds =
			Array.isArray(context.documentIds) && context.documentIds.length > 0
				? context.documentIds
				: undefined;

		const { total, documents } = await DocumentsRepository.titles({ documentIds, limit, offset });

		const scopeNote = documentIds
			? 'counts cover only the documents selected for this chat'
			: 'counts cover every active document in the corpus';
		const remaining = total - (offset + documents.length);
		const pagingNote =
			remaining > 0
				? `; ${remaining} more title(s) remain, call again with offset=${offset + documents.length}`
				: '';

		const data: CorpusDetailsData = {
			totalDocuments: total,
			offset,
			returned: documents.length,
			documents: documents.map((document) => ({
				documentId: document.id,
				documentPath: pythonDocumentPath(document.sourcePath),
				title: document.title,
				sourceType: document.sourceType
			})),
			note: `titles are alphabetical; ${scopeNote}${pagingNote}`
		};

		return createToolResult(data);
	}
};
