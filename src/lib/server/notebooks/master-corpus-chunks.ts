import { assembleChunks } from '$lib/server/rag/chunk/assemble-chunks';
import { chunkPages } from '$lib/server/rag/chunk/chunker';
import type { ExtractedChunk, ParsedChunk, Source } from '$lib/server/rag/chunk/parse-shared';

export interface NotebookCorpusPage {
	title: string;
	content: string;
	pageIndex: number;
}

export interface NotebookCorpusInput {
	notebookId: string;
	notebookTitle: string;
	pages: NotebookCorpusPage[];
}

export function buildNotebookCorpusChunks(input: NotebookCorpusInput): ParsedChunk[] {
	const source: Source = {
		title: input.notebookTitle,
		type: 'NOTEBOOK',
		path: `notebook:${input.notebookId}`
	};
	const extractedPages: ExtractedChunk[] = input.pages
		.filter(({ content }) => content.trim())
		.map((page) => ({
			source,
			chunkType: 'TEXT',
			pageIndex: page.pageIndex,
			content: [
				`Notebook: ${input.notebookTitle}`,
				`Notebook page: ${page.title}`,
				'',
				page.content.trim()
			].join('\n')
		}));
	return assembleChunks(extractedPages, chunkPages(extractedPages));
}
