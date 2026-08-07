import { constants } from 'node:fs';
import { access, readdir, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { error, json } from '@sveltejs/kit';
import type { ApiDocumentDirectoryItem, ApiDocumentDirectoryResponse } from '$lib/types';
import { containsPath } from '$lib/server/documents/remove-document';
import { handlerForPath } from '$lib/server/documents/source-types';
import type { RequestHandler } from './$types';

const MAX_PAGE_SIZE = 500;

function parseCount(value: string | null, name: string): number | undefined {
	if (value === null) return undefined;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw error(400, `The ${name} parameter must be a non-negative integer.`);
	}
	return parsed;
}

export const GET: RequestHandler = async ({ url }) => {
	const root = await realpath(homedir());
	const requested = url.searchParams.get('path')?.trim() || root;
	const purpose = url.searchParams.get('purpose') ?? 'documents';
	const sort = url.searchParams.get('sort') ?? 'asc';
	const offset = parseCount(url.searchParams.get('offset'), 'offset') ?? 0;
	const requestedLimit = parseCount(url.searchParams.get('limit'), 'limit');
	const limit = requestedLimit === undefined ? undefined : Math.min(requestedLimit, MAX_PAGE_SIZE);

	if (purpose !== 'documents' && purpose !== 'notebook') {
		throw error(400, 'Unsupported directory browsing purpose.');
	}
	if (sort !== 'asc' && sort !== 'desc') throw error(400, 'Unsupported sort direction.');

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
			if (purpose === 'notebook') {
				if (extension === '.md' || extension === '.txt') {
					items.push({ kind: 'text', name: entry.name, path });
				}
			} else {
				const handler = handlerForPath(entry.name);
				if (handler) items.push({ kind: handler.kind, name: entry.name, path });
			}
		}
	}

	const direction = sort === 'desc' ? -1 : 1;
	items.sort((left, right) => {
		if (left.kind === 'folder' && right.kind !== 'folder') return -1;
		if (right.kind === 'folder' && left.kind !== 'folder') return 1;
		return direction * left.name.localeCompare(right.name);
	});

	return json({
		path: directory,
		parentPath: directory === root ? null : resolve(directory, '..'),
		items: limit === undefined ? items : items.slice(offset, offset + limit),
		total: items.length
	} satisfies ApiDocumentDirectoryResponse);
};
