import type { WorkerConverter } from '@matbee/libreoffice-converter/server';

export type OfficeInputFormat = 'docx' | 'pptx' | 'xlsx';

const IDLE_TEARDOWN_MS = 5 * 60 * 1000;

let converterPromise: Promise<WorkerConverter> | undefined;
let conversionQueue: Promise<unknown> = Promise.resolve();
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function getConverter(): Promise<WorkerConverter> {
	converterPromise ??= import('@matbee/libreoffice-converter/server').then((module) =>
		module.createWorkerConverter()
	);
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
		await (await pending).destroy();
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
		try {
			const converter = await getConverter();
			const result = await converter.convert(buffer, { outputFormat: 'pdf', inputFormat });
			scheduleIdleTeardown();
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
