type FileSystemPermissionMode = 'read' | 'readwrite';

interface FileSystemHandlePermissionDescriptor {
	mode?: FileSystemPermissionMode;
}

interface FileSystemHandle {
	queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
	requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
	values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
}

interface OpenFilePickerType {
	description?: string;
	accept: Record<string, readonly string[]>;
}

interface OpenFilePickerOptions {
	multiple?: boolean;
	excludeAcceptAllOption?: boolean;
	types?: OpenFilePickerType[];
	id?: string;
}

interface DirectoryPickerOptions {
	id?: string;
	mode?: FileSystemPermissionMode;
}

interface FileSystemObserverRecord {
	type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';
	root: FileSystemHandle;
	changedHandle: FileSystemHandle | null;
	relativePathComponents: readonly string[];
}

declare class FileSystemObserver {
	constructor(
		callback: (records: FileSystemObserverRecord[], observer: FileSystemObserver) => void
	);
	observe(handle: FileSystemHandle, options?: { recursive?: boolean }): Promise<void>;
	unobserve(handle: FileSystemHandle): void;
	disconnect(): void;
}

interface Window {
	showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
	showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
	FileSystemObserver?: typeof FileSystemObserver;
}
