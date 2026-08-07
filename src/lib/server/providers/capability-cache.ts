const DEFAULT_TTL_MS = 5 * 60_000;
const FAILURE_TTL_MS = 30_000;

type CacheEntry = {
	promise: Promise<boolean>;
	expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

export function cachedCapability(
	key: string,
	probe: () => Promise<boolean>,
	ttlMs = DEFAULT_TTL_MS
): Promise<boolean> {
	const now = Date.now();
	const existing = cache.get(key);
	if (existing && existing.expiresAt > now) return existing.promise;

	const entry: CacheEntry = {
		promise: probe().catch(() => {
			const current = cache.get(key);
			if (current === entry) {
				cache.set(key, { promise: entry.promise, expiresAt: Date.now() + FAILURE_TTL_MS });
			}
			return true;
		}),
		expiresAt: now + ttlMs
	};

	cache.set(key, entry);
	return entry.promise;
}
