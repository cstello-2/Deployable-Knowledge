import type { WorkerConverter } from '@matbee/libreoffice-converter/server';
import { withTimeout } from '$lib/server/utils/with-timeout';

export type OfficeInputFormat = 'docx' | 'pptx' | 'xlsx';

const IDLE_TEARDOWN_MS = 5 * 60 * 1000;
const CONVERSION_TIMEOUT_MS = 2 * 60 * 1000;
const TEARDOWN_TIMEOUT_MS = 5 * 1000;

let converterPromise: Promise<WorkerConverter> | undefined;
let conversionQueue: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function getConverter(): Promise<WorkerConverter> {
	converterPromise ??= import('@matbee/libreoffice-converter/server')
		.then((module) => module.createWorkerConverter())
		.catch((error) => {
			converterPromise = undefined;
			throw error;
		});
	return converterPromise;
}

async function destroyConverter(): Promise<void> {
	const pending = converterPromise;
	converterPromise = undefined;
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = undefined;
	}
	if (!pending) return;
	try {
		await withTimeout(
			pending.then((converter) => converter.destroy()),
			TEARDOWN_TIMEOUT_MS,
			'Teardown timed out.'
		);
	} catch (error) {
		console.warn('[Office Converter] Teardown failed.', error);
	}
}

function scheduleIdleTeardown(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		idleTimer = undefined;
		void destroyConverter();
	}, IDLE_TEARDOWN_MS);
	idleTimer.unref?.();
}

export function convertOfficeToPdf(
	buffer: Buffer,
	inputFormat: OfficeInputFormat
): Promise<Buffer> {
	const task = conversionQueue.then(async () => {
		const started = Date.now();
		console.log(`[Office Converter] Converting ${inputFormat} (${Math.round(buffer.length / 1024)} KB)...`);
		try {
			const converter = await getConverter();
			const result = await withTimeout(
				converter.convert(buffer, { outputFormat: 'pdf', inputFormat }),
				CONVERSION_TIMEOUT_MS,
				'Conversion timed out.'
			);
			scheduleIdleTeardown();
			console.log(
				`[Office Converter] ${inputFormat} to PDF in ${((Date.now() - started) / 1000).toFixed(1)}s.`
			);
			return Buffer.from(result.data);
		} catch (error) {
			console.error('[Office Converter] Conversion failed.', error);
			await destroyConverter();
			throw new Error(
				'Could not convert this file to PDF. It may be corrupt or password-protected.'
			);
		}
	});
	conversionQueue = task.catch(() => undefined);
	return task;
}
