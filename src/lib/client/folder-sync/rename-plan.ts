import type { ApiSyncFileStat } from '$lib/types';

export interface RenamePlan {
	replaces: Map<string, string>;
	stale: string[];
}

function statKey({ lastModified, size }: ApiSyncFileStat): string {
	return `${lastModified}:${size}`;
}

export function matchRenames(
	upload: ApiSyncFileStat[],
	staleEntries: ApiSyncFileStat[]
): RenamePlan {
	const unmatched = new Map<string, string[]>();
	for (const entry of staleEntries) {
		const key = statKey(entry);
		const paths = unmatched.get(key);
		if (paths) paths.push(entry.path);
		else unmatched.set(key, [entry.path]);
	}

	const replaces = new Map<string, string>();
	const claimed = new Set<string>();
	for (const entry of upload) {
		const match = unmatched.get(statKey(entry))?.shift();
		if (!match) continue;
		replaces.set(entry.path, match);
		claimed.add(match);
	}

	return {
		replaces,
		stale: staleEntries.map(({ path }) => path).filter((path) => !claimed.has(path))
	};
}
