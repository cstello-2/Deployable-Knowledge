import { browser } from '$app/environment';

const DB_NAME = 'dk-folder-sync';
const STORE = 'folders';

export interface StoredFolderHandle {
	id: string;
	name: string;
	handle: FileSystemDirectoryHandle;
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE, { keyPath: 'id' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'));
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const database = await openDatabase();
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = run(database.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
		});
	} finally {
		database.close();
	}
}

export async function putFolder(record: StoredFolderHandle): Promise<void> {
	if (!browser) return;
	await withStore('readwrite', (store) => store.put(record));
}

export async function listFolders(): Promise<StoredFolderHandle[]> {
	if (!browser) return [];
	return withStore('readonly', (store) => store.getAll() as IDBRequest<StoredFolderHandle[]>);
}

export async function deleteFolder(id: string): Promise<void> {
	if (!browser) return;
	await withStore('readwrite', (store) => store.delete(id));
}
