import { eq } from 'drizzle-orm';
import { NOTEBOOK_SOURCE_CONTEXT_CHARACTER_LIMIT, RAG_CHUNK_CHARACTER_LIMIT } from '$lib/constants';
import { db } from '$lib/server/database/database';
import { documentChunks, notebookSources } from '$lib/server/database/schema';

export async function getNotebookSourceExcerpts(notebookId: string): Promise<string> {
	const rows = await db
		.select({ content: documentChunks.content })
		.from(notebookSources)
		.innerJoin(documentChunks, eq(documentChunks.id, notebookSources.chunkId))
		.where(eq(notebookSources.notebookId, notebookId));

	const excerpts: string[] = [];
	let remaining = NOTEBOOK_SOURCE_CONTEXT_CHARACTER_LIMIT;
	for (const [index, row] of rows.entries()) {
		const prefix = `[${index + 1}] `;
		const separatorLength = excerpts.length ? 2 : 0;
		const available = remaining - prefix.length - separatorLength;
		if (available <= 0) break;
		const text = row.content
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, Math.min(RAG_CHUNK_CHARACTER_LIMIT, available));
		if (!text) continue;
		const excerpt = `${prefix}${text}`;
		excerpts.push(excerpt);
		remaining -= excerpt.length + separatorLength;
	}
	return excerpts.join('\n\n');
}
