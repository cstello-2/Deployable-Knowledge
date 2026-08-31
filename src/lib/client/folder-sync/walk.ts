export interface WalkedFile {
	path: string;
	file: File;
}

function isHiddenName(name: string): boolean {
	return name.startsWith('.') || name === '__MACOSX';
}

export async function collectFiles(
	directory: FileSystemDirectoryHandle,
	filter: (name: string) => boolean
): Promise<WalkedFile[]> {
	const files: WalkedFile[] = [];

	async function walk(handle: FileSystemDirectoryHandle, prefix: string): Promise<void> {
		for await (const entry of handle.values()) {
			if (isHiddenName(entry.name)) continue;
			const path = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.kind === 'directory') {
				await walk(entry as FileSystemDirectoryHandle, path);
			} else if (filter(entry.name)) {
				files.push({ path, file: await (entry as FileSystemFileHandle).getFile() });
			}
		}
	}

	await walk(directory, '');
	return files.sort((left, right) => left.path.localeCompare(right.path));
}
