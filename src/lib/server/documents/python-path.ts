import { basename, dirname, posix, resolve } from 'node:path';

export const PYTHON_DOCUMENTS_MOUNT = '/documents';
export const DOCUMENTS_DIR = 'documents';

export function pythonDocumentPath(sourcePath: string): string | null {
	const hostPath = resolve(sourcePath);
	if (dirname(hostPath) !== resolve(DOCUMENTS_DIR)) return null;
	return posix.join(PYTHON_DOCUMENTS_MOUNT, basename(hostPath));
}
