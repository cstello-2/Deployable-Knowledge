import { readFile } from 'node:fs/promises';
import { PDFParse, type EmbeddedImage, type TableArray } from 'pdf-parse';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { normalizeWhitespace, type ExtractedChunk as Chunk, type Source } from './parse-shared.ts';
import { cleanOcrText } from './ocr-text-quality';

export type TextExtractionResult = {
	chunks: Chunk[];
	pageCount: number;
};

function tableToText(table: TableArray): string {
	return table
		.map((row) => row.map(normalizeWhitespace).filter(Boolean).join(' | '))
		.filter(Boolean)
		.join('\n');
}

async function ocrEmbeddedImages(
	data: Uint8Array,
	pageCount: number,
	nativeTextByPage: ReadonlyMap<number, string>,
	onPageProgress?: (current: number, total: number) => void
): Promise<Map<number, string[]>> {
	const textByPage = new Map<number, string[]>();
	let worker: Worker | undefined;

	try {
		for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
			const images = await getPageImages(data, pageNumber);

			if (images.length > 0) {
				console.log(`[OCR] Page ${pageNumber}/${pageCount}: ${images.length} image(s)`);
			}

			for (const image of images) {
				if (image.width < 80 || image.height < 24) continue;
				if (!worker) {
					worker = await createWorker('eng', OEM.LSTM_ONLY, {
						cacheMethod: 'readOnly',
						cachePath: process.cwd(),
						gzip: false,
						langPath: process.cwd()
					});
					await worker.setParameters({
						tessedit_pageseg_mode: PSM.SPARSE_TEXT,
						user_defined_dpi: '300',
						debug_file: '/dev/null'
					});
				}

				try {
					const result = await worker.recognize(Buffer.from(image.data));
					const text = cleanOcrText(result.data.text, {
						confidence: result.data.confidence,
						nativeText: nativeTextByPage.get(pageNumber) ?? ''
					});

					if (text) {
						textByPage.set(pageNumber, [...(textByPage.get(pageNumber) ?? []), text]);
					}
				} catch (error) {
					console.warn(`[OCR] Could not read an image on page ${pageNumber}.`, error);
				}
			}

			onPageProgress?.(pageNumber, pageCount);
		}
	} finally {
		await worker?.terminate();
	}

	return textByPage;
}

async function getPageImages(data: Uint8Array, pageNumber: number): Promise<EmbeddedImage[]> {
	const parser = new PDFParse({ data });

	try {
		const result = await parser.getImage({ partial: [pageNumber], imageDataUrl: false });
		return result.pages[0]?.images ?? [];
	} catch (error) {
		console.warn(`[OCR] Could not extract images from page ${pageNumber}; skipping it.`, error);
		return [];
	} finally {
		await parser.destroy();
	}
}

export async function extractText(
	file: Source,
	onPageProgress?: (current: number, total: number) => void
): Promise<TextExtractionResult> {
	const data = await readFile(file.path);
	const parser = new PDFParse({ data });

	try {
		const textResult = await parser.getText();
		const nativeTextByPage = new Map<number, string>();
		for (let pageNumber = 1; pageNumber <= textResult.total; pageNumber += 1) {
			nativeTextByPage.set(pageNumber, normalizeWhitespace(textResult.getPageText(pageNumber)));
		}
		const ocrTextByPage = await ocrEmbeddedImages(
			data,
			textResult.total,
			nativeTextByPage,
			onPageProgress
		);
		const tableResult = await parser.getTable();
		const chunks: Chunk[] = [];

		for (let pageNumber = 1; pageNumber <= textResult.total; pageNumber += 1) {
			const pageIndex = pageNumber - 1;
			const nativeText = nativeTextByPage.get(pageNumber) ?? '';

			if (nativeText) {
				chunks.push({ chunkType: 'TEXT', source: file, pageIndex, content: nativeText });
			}

			for (const content of ocrTextByPage.get(pageNumber) ?? []) {
				chunks.push({ chunkType: 'IMAGE', source: file, pageIndex, content });
			}

			const tables = tableResult.pages.find((page) => page.num === pageNumber)?.tables ?? [];

			for (const table of tables) {
				const content = tableToText(table);

				if (content) {
					chunks.push({ chunkType: 'TABLE', source: file, pageIndex, content });
				}
			}
		}

		return { chunks, pageCount: textResult.total };
	} finally {
		await parser.destroy();
	}
}
