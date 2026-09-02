export interface WalkedFile {
	path: string;
	file: File;
}

// Each getFile() is a round trip to the browser's file system process. Resolving
// them one after another is what makes a scan of a few thousand documents take
// minutes, so they go out in bounded waves instead.
const STAT_CONCURRENCY = 32;

function isHiddenName(name: string): boolean {
	return name.startsWith('.') || name === '__MACOSX';
}

export async function collectFiles(
	directory: FileSystemDirectoryHandle,
	filter: (name: string) => boolean
): Promise<WalkedFile[]> {
	const handles: { path: string; handle: FileSystemFileHandle }[] = [];

	async function walk(handle: FileSystemDirectoryHandle, prefix: string): Promise<void> {
		for await (const entry of handle.values()) {
			if (isHiddenName(entry.name)) continue;
			const path = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.kind === 'directory') {
				await walk(entry as FileSystemDirectoryHandle, path);
			} else if (filter(entry.name)) {
				handles.push({ path, handle: entry as FileSystemFileHandle });
			}
		}
	}

	await walk(directory, '');

	const files: WalkedFile[] = [];
	for (let offset = 0; offset < handles.length; offset += STAT_CONCURRENCY) {
		const wave = handles.slice(offset, offset + STAT_CONCURRENCY);
		const resolved = await Promise.all(wave.map(({ handle }) => handle.getFile()));
		for (let index = 0; index < wave.length; index += 1) {
			files.push({ path: wave[index].path, file: resolved[index] });
		}
	}

	return files.sort((left, right) => left.path.localeCompare(right.path));
}
