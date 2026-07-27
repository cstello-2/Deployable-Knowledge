import { constants } from 'node:fs';
import { access, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { error, json } from '@sveltejs/kit';
import type { ApiDocumentDirectoryItem, ApiDocumentDirectoryResponse } from '$lib/types';
import { containsPath } from '$lib/server/documents/remove-document';
import type { RequestHandler } from './$types';
import { isSupportedAudioPath } from '$lib/utils';

export const GET: RequestHandler = async ({ url }) => {
	const root = await realpath(homedir());
	const requested = url.searchParams.get('path')?.trim() || root;

	let directory: string;
	try {
		directory = await realpath(resolve(requested));
		const directoryStats = await stat(directory);
		if (!directoryStats.isDirectory()) throw new Error('Not a directory.');
		await access(directory, constants.R_OK);
	} catch {
		throw error(400, 'Directory does not exist or cannot be read.');
	}

	if (!containsPath(root, directory)) throw error(403, 'Directory is outside your home folder.');

	const items: ApiDocumentDirectoryItem[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.name.startsWith('.')) continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) items.push({ name: entry.name, path, kind: 'folder' });
		if (entry.isFile()) {
			const extension = extname(entry.name).toLowerCase();
			if (extension === '.pdf') {
				items.push({ name: entry.name, path, kind: 'pdf' });
			} else if (isSupportedAudioPath(entry.name)) {
				items.push({ kind: 'audio', name: entry.name, path });
			} else if (extension === '.md') {
				items.push({ name: entry.name, path, kind: 'markdown' });
			}
		}
	}

	items.sort((left, right) => {
		if (left.kind === 'folder' && right.kind !== 'folder') return -1;
		if (right.kind === 'folder' && left.kind !== 'folder') return 1;
		return left.name.localeCompare(right.name);
	});

	return json({
		path: directory,
		parentPath: directory === root ? null : resolve(directory, '..'),
		items
	} satisfies ApiDocumentDirectoryResponse);
};
