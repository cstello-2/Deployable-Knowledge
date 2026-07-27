import { ERROR_MESSAGES, HTTP_CODE_TO_STRING } from '$lib/constants';

export class ApiError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export interface ApiFetchOptions extends Omit<RequestInit, 'headers'> {
	headers?: HeadersInit;
}

export async function parseErrorMessage(response: Response): Promise<string> {
	try {
		const value = (await response.clone().json()) as {
			error?: string | { message?: string };
			message?: string;
		};
		if (typeof value.error === 'string') return value.error;
		if (value.error?.message) return value.error.message;
		if (value.message) return value.message;
	} catch {
		const text = await response.text().catch(() => '');
		if (text.trim()) return text.trim();
	}

	return (
		HTTP_CODE_TO_STRING[response.status] ??
		`${ERROR_MESSAGES.HTTP.GENERIC}: ${response.status} ${response.statusText}`.trim()
	);
}

async function request(path: string, options: ApiFetchOptions = {}): Promise<Response> {
	const headers = new Headers(options.headers);
	if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}

	let response: Response;
	try {
		response = await fetch(path, { ...options, headers });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`${ERROR_MESSAGES.NETWORK.GENERIC} (${message})`);
	}

	if (!response.ok) throw new ApiError(await parseErrorMessage(response), response.status);
	return response;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
	const response = await request(path, options);
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

function downloadFilename(response: Response, fallback: string): string {
	const disposition = response.headers.get('Content-Disposition') ?? '';
	const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
	if (encoded) {
		try {
			return decodeURIComponent(encoded);
		} catch {
			// Fall through to the plain filename when a server sends malformed encoding.
		}
	}
	return disposition.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

export async function apiDownload(
	path: string,
	fallbackFilename: string,
	options: ApiFetchOptions = {}
): Promise<string> {
	const response = await request(path, options);
	const filename = downloadFilename(response, fallbackFilename);
	const objectUrl = URL.createObjectURL(await response.blob());
	const link = document.createElement('a');
	link.download = filename;
	link.href = objectUrl;
	link.hidden = true;
	document.body.append(link);
	try {
		link.click();
	} finally {
		link.remove();
		URL.revokeObjectURL(objectUrl);
	}
	return filename;
}

export function apiPost<T, B = unknown>(path: string, body: B, options: ApiFetchOptions = {}) {
	return apiFetch<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) });
}

export function apiPatch<T, B = unknown>(path: string, body: B, options: ApiFetchOptions = {}) {
	return apiFetch<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) });
}

export function apiDelete<T, B = undefined>(path: string, body?: B, options: ApiFetchOptions = {}) {
	return apiFetch<T>(path, {
		...options,
		method: 'DELETE',
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
}

export function apiStream(path: string, options: ApiFetchOptions = {}) {
	return request(path, options).then((response) => {
		if (!response.body) throw new Error('The server returned an empty stream.');
		return response;
	});
}
