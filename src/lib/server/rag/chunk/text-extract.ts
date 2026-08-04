import { readFile } from 'node:fs/promises';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import { PDFParse, type EmbeddedImage, type TableArray, type TableResult } from 'pdf-parse';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { withTimeout } from '$lib/server/utils/with-timeout';
import {
	normalizeWhitespace,
	type ExtractedChunk as Chunk,
	type ExtractionResult,
	type Source
} from './parse-shared.ts';

const MIN_OCR_CONFIDENCE = 80;
const MIN_OCR_ONLY_CONFIDENCE = 50;
const MAX_OCR_PIXELS = 50_000_000;
const OCR_IMAGE_TIMEOUT_MS = 120_000;
const OCR_STARTUP_TIMEOUT_MS = 60_000;
const PAGE_IMAGE_TIMEOUT_MS = 60_000;
const TABLE_DETECTION_TIMEOUT_MS = 120_000;
const CLEANUP_TIMEOUT_MS = 10_000;
const MAX_OCR_FAILURES = 3;

function seconds(started: number): string {
	return `${((Date.now() - started) / 1000).toFixed(1)}s`;
}

function tableToText(table: TableArray): string {
	return table
		.map((row) => row.map(normalizeWhitespace).filter(Boolean).join(' | '))
		.filter(Boolean)
		.join('\n');
}

async function releasePageCaches(parser: PDFParse): Promise<void> {
	const doc = (parser as unknown as { doc?: { cleanup?: () => Promise<unknown> } }).doc;
	await withTimeout(
		Promise.resolve(doc?.cleanup?.()),
		CLEANUP_TIMEOUT_MS,
		'Page cache cleanup timed out.'
	).catch(() => undefined);
}

type OcrSession = {
	worker: Worker;
	exited: Promise<never>;
};

async function createOcrSession(): Promise<OcrSession> {
	const creation = createWorker('eng', OEM.LSTM_ONLY, {
		cacheMethod: 'readOnly',
		cachePath: process.cwd(),
		gzip: false,
		langPath: process.cwd(),
		errorHandler: (error: unknown) => console.error('[OCR] Worker error.', error)
	}).then(async (worker) => {
		await worker.setParameters({
			tessedit_pageseg_mode: PSM.AUTO,
			user_defined_dpi: '300',
			debug_file: '/dev/null'
		});
		return worker;
	});

	let worker: Worker;
	try {
		worker = await withTimeout(creation, OCR_STARTUP_TIMEOUT_MS, 'OCR worker startup timed out.');
	} catch (error) {
		void creation.then((late) => late.terminate()).catch(() => undefined);
		throw error;
	}

	const thread = (worker as unknown as { worker?: NodeJS.EventEmitter }).worker;
	const exited = new Promise<never>((_, reject) => {
		thread?.once?.('exit', (code: unknown) => {
			reject(new Error(`OCR worker exited unexpectedly (code ${String(code)}).`));
		});
	});
	exited.catch(() => undefined);

	return { worker, exited };
}

function recognizeImage(session: OcrSession, image: EmbeddedImage) {
	return withTimeout(
		Promise.race([session.worker.recognize(Buffer.from(image.data)), session.exited]),
		OCR_IMAGE_TIMEOUT_MS,
		`OCR timed out after ${OCR_IMAGE_TIMEOUT_MS / 1000}s.`
	);
}

async function ocrEmbeddedImages(
	parser: PDFParse,
	pageCount: number,
	pagesWithText: ReadonlySet<number>,
	onPageProgress?: (current: number, total: number) => void
): Promise<Map<number, string[]>> {
	const textByPage = new Map<number, string[]>();
	let session: OcrSession | undefined;
	let failures = 0;

	try {
		for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
			const images = await getPageImages(parser, pageNumber);
			const minConfidence = pagesWithText.has(pageNumber)
				? MIN_OCR_CONFIDENCE
				: MIN_OCR_ONLY_CONFIDENCE;

			if (images.length > 0) {
				const sizes = images.map((image) => `${image.name} ${image.width}x${image.height}`);
				console.log(`[OCR] Page ${pageNumber}/${pageCount}: ${images.length} image(s): ${sizes.join(', ')}`);
			}

			for (const image of images) {
				if (image.width * image.height > MAX_OCR_PIXELS) {
					console.warn(
						`[OCR] Page ${pageNumber}: skipped ${image.name} at ${image.width}x${image.height}; too large to OCR.`
					);
					continue;
				}

				try {
					session ??= await createOcrSession();

					const recognizeStarted = Date.now();
					const result = await recognizeImage(session, image);
					const text = normalizeWhitespace(result.data.text);
					const confidence = result.data.confidence;
					failures = 0;

					if (Date.now() - recognizeStarted > 15_000) {
						console.log(
							`[OCR] Page ${pageNumber}: ${image.name} took ${seconds(recognizeStarted)} at ${Math.round(confidence)}% confidence.`
						);
					}

					if (text && confidence >= minConfidence) {
						textByPage.set(pageNumber, [...(textByPage.get(pageNumber) ?? []), text]);
					} else if (text) {
						console.log(
							`[OCR] Page ${pageNumber}: discarded ${image.name} at ${Math.round(confidence)}% confidence.`
						);
					}
				} catch (error) {
					failures += 1;
					console.warn(
						`[OCR] Page ${pageNumber}: ${image.name} failed (${failures}/${MAX_OCR_FAILURES}); replacing the worker.`,
						error
					);
					await session?.worker.terminate().catch(() => undefined);
					session = undefined;

					if (failures >= MAX_OCR_FAILURES) {
						console.error(
							`[OCR] Giving up after ${failures} consecutive failures; continuing without further image text.`
						);
						return textByPage;
					}
				}
			}

			await releasePageCaches(parser);
			onPageProgress?.(pageNumber, pageCount);
			await yieldEventLoop();
		}
	} finally {
		await session?.worker.terminate().catch(() => undefined);
	}

	return textByPage;
}

async function getPageImages(parser: PDFParse, pageNumber: number): Promise<EmbeddedImage[]> {
	try {
		const result = await withTimeout(
			parser.getImage({ partial: [pageNumber], imageDataUrl: false }),
			PAGE_IMAGE_TIMEOUT_MS,
			`Image extraction timed out after ${PAGE_IMAGE_TIMEOUT_MS / 1000}s.`
		);
		return result.pages[0]?.images ?? [];
	} catch (error) {
		console.warn(`[OCR] Could not extract images from page ${pageNumber}; skipping it.`, error);
		return [];
	}
}

export async function extractText(
	file: Source,
	onPageProgress?: (current: number, total: number) => void
): Promise<ExtractionResult> {
	const data = await readFile(file.path);
	const parser = new PDFParse({ data });

	try {
		const textStarted = Date.now();
		const textResult = await parser.getText();

		const pagesWithText = new Set<number>();
		for (let pageNumber = 1; pageNumber <= textResult.total; pageNumber += 1) {
			if (normalizeWhitespace(textResult.getPageText(pageNumber))) {
				pagesWithText.add(pageNumber);
			}
		}
		console.log(
			`[PDF] ${file.title}: ${textResult.total} page(s), native text on ${pagesWithText.size}, in ${seconds(textStarted)}.`
		);

		const ocrStarted = Date.now();
		const ocrTextByPage = await ocrEmbeddedImages(
			parser,
			textResult.total,
			pagesWithText,
			onPageProgress
		);
		console.log(
			`[PDF] ${file.title}: OCR pass added text on ${ocrTextByPage.size} page(s) in ${seconds(ocrStarted)}.`
		);

		let tablePages: TableResult['pages'] = [];
		const tableStarted = Date.now();
		try {
			const tableResult = await withTimeout(
				parser.getTable(),
				TABLE_DETECTION_TIMEOUT_MS,
				`Table detection timed out after ${TABLE_DETECTION_TIMEOUT_MS / 1000}s.`
			);
			tablePages = tableResult.pages;
			console.log(
				`[PDF] ${file.title}: ${tablePages.reduce((sum, page) => sum + page.tables.length, 0)} table(s) in ${seconds(tableStarted)}.`
			);
		} catch (error) {
			console.warn(`[PDF] ${file.title}: continuing without tables.`, error);
		}

		const chunks: Chunk[] = [];

		for (let pageNumber = 1; pageNumber <= textResult.total; pageNumber += 1) {
			const pageIndex = pageNumber - 1;
			const nativeText = normalizeWhitespace(textResult.getPageText(pageNumber));

			if (nativeText) {
				chunks.push({ chunkType: 'TEXT', source: file, pageIndex, content: nativeText });
			}

			for (const content of ocrTextByPage.get(pageNumber) ?? []) {
				chunks.push({ chunkType: 'IMAGE', source: file, pageIndex, content });
			}

			const tables = tablePages.find((page) => page.num === pageNumber)?.tables ?? [];

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
