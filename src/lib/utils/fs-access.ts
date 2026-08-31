import { browser } from '$app/environment';

export function supportsFilePicker(): boolean {
	return browser && typeof window.showOpenFilePicker === 'function';
}

export function supportsFolderSync(): boolean {
	return browser && typeof window.showDirectoryPicker === 'function' && 'indexedDB' in window;
}

export function supportsFileObserver(): boolean {
	return browser && typeof window.FileSystemObserver === 'function';
}

export const FOLDER_SYNC_UNSUPPORTED_MESSAGE =
	'Folder sync requires the File System Access API, available in Chrome and Edge. Firefox and Safari do not support it.';

export const FOLDER_IMPORT_UNSUPPORTED_MESSAGE =
	'Importing a folder requires the File System Access API, available in Chrome and Edge. Firefox and Safari do not support it.';

export interface PickFilesOptions {
	multiple?: boolean;
	extensions: readonly string[];
	accept?: Record<string, readonly string[]>;
	description?: string;
}

export async function pickFiles(options: PickFilesOptions): Promise<File[]> {
	if (!browser) return [];
	if (typeof window.showOpenFilePicker === 'function') {
		try {
			const handles = await window.showOpenFilePicker({
				multiple: options.multiple ?? false,
				excludeAcceptAllOption: true,
				types: options.accept
					? [{ description: options.description, accept: options.accept }]
					: undefined
			});
			return await Promise.all(handles.map((handle) => handle.getFile()));
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') return [];
			throw cause;
		}
	}
	return pickFilesWithInput(options);
}

function pickFilesWithInput(options: PickFilesOptions): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = options.multiple ?? false;
		input.accept = options.extensions.join(',');
		input.style.display = 'none';

		const finish = (files: File[]) => {
			input.remove();
			resolve(files);
		};
		input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
		input.addEventListener('cancel', () => finish([]));

		document.body.append(input);
		input.click();
	});
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
	if (!browser || typeof window.showDirectoryPicker !== 'function') return null;
	try {
		return await window.showDirectoryPicker({ mode: 'read' });
	} catch (cause) {
		if (cause instanceof DOMException && cause.name === 'AbortError') return null;
		throw cause;
	}
}
