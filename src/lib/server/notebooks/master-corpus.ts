import { storeDocumentChunks } from '$lib/server/rag/embedding';
import { buildNotebookCorpusChunks, type NotebookCorpusInput } from './master-corpus-chunks';

export interface NotebookCorpusResult {
	documentId: string;
	title: string;
	pageCount: number;
	chunkCount: number;
}

export async function storeNotebookInMasterCorpus(
	input: NotebookCorpusInput
): Promise<NotebookCorpusResult> {
	const chunks = buildNotebookCorpusChunks(input);
	if (!chunks.length) throw new Error('Select at least one notebook page containing text.');
	const stored = await storeDocumentChunks(chunks);
	return {
		documentId: stored.documentId,
		title: input.notebookTitle,
		pageCount: new Set(chunks.map(({ pageIndex }) => pageIndex)).size,
		chunkCount: stored.chunkCount
	};
}
