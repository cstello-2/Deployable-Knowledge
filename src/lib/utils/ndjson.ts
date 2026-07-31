import { NDJSON_LINE_SEPARATOR } from '$lib/constants';

export async function* parseNdjsonStream<T>(
	response: Response,
	signal?: AbortSignal
): AsyncGenerator<T> {
	const reader = response.body?.getReader();
	if (!reader) return;

	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			if (signal?.aborted) return;
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split(NDJSON_LINE_SEPARATOR);
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				const parsed = parseLine<T>(line);
				if (parsed !== undefined) yield parsed;
			}
		}

		buffer += decoder.decode();
		const parsed = parseLine<T>(buffer);
		if (parsed !== undefined) yield parsed;
	} finally {
		reader.releaseLock();
	}
}

function parseLine<T>(line: string): T | undefined {
	if (!line.trim()) return undefined;
	try {
		return JSON.parse(line) as T;
	} catch {
		return undefined;
	}
}
