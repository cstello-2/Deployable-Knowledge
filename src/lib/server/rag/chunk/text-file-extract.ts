import { readFile } from 'node:fs/promises';
import type { ExtractionResult, Source } from './parse-shared';

export async function extractPlainText(source: Source): Promise<ExtractionResult> {
	const content = (await readFile(source.path, 'utf8')).replace(/^\uFEFF/, '');
	if (!content.trim()) return { chunks: [], pageCount: 0 };

	return {
		chunks: [{ chunkType: 'TEXT', source, pageIndex: 0, content }],
		pageCount: 1
	};
}
