export function normalizeRetrievalQuery(query: string): string {
	return query.trim().replace(/\s+/g, ' ').toLowerCase();
}
