import type { ApiNotebookMasterCorpusResponse } from '$lib/types';
import { storeDocumentChunks } from '$lib/server/rag/embedding';
import { buildNotebookCorpusChunks, type NotebookCorpusInput } from './master-corpus-chunks';

export async function storeNotebookInMasterCorpus(
	input: NotebookCorpusInput
): Promise<ApiNotebookMasterCorpusResponse> {
	const chunks = buildNotebookCorpusChunks(input);
	if (!chunks.length) throw new Error('Select at least one notebook page containing text.');
	const stored = await storeDocumentChunks(chunks);
	return {
		chunkCount: stored.chunkCount,
		documentId: stored.documentId,
		pageCount: new Set(chunks.map(({ pageIndex }) => pageIndex)).size,
		title: input.notebookTitle
	};
}
