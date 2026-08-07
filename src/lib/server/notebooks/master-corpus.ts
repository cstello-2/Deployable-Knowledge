import { storeDocumentChunks } from '$lib/server/rag/embedding';
import { buildNotebookCorpusChunks, type NotebookCorpusInput } from './master-corpus-chunks';

export type NotebookCorpusResult = {
	documentId: string;
	title: string;
	pageCount: number;
	chunkCount: number;
};

// "Master Corpus" = embed the notebook's own pages as a document so their
// content becomes retrievable in chat/search just like an uploaded file
export async function storeNotebookInMasterCorpus(
	input: NotebookCorpusInput
): Promise<NotebookCorpusResult> {
	const chunks = buildNotebookCorpusChunks(input);
	if (chunks.length === 0) {
		throw new Error('Select at least one notebook page containing text.');
	}

	const stored = await storeDocumentChunks(chunks);

	return {
		documentId: stored.documentId,
		title: input.notebookTitle,
		pageCount: new Set(chunks.map((chunk) => chunk.pageIndex)).size,
		chunkCount: stored.chunkCount
	};
}
