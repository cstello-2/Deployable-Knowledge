import { databaseClient } from '../../database/database';

export type ChunkPosition = {
	position: number;
	totalChunks: number;
};

export async function getChunkPositions(
	refs: readonly { chunkId: string; documentId: string }[]
): Promise<Map<string, ChunkPosition>> {
	const positions = new Map<string, ChunkPosition>();
	if (refs.length === 0) return positions;

	const documentIds = [...new Set(refs.map((ref) => ref.documentId))];
	const chunkIds = [...new Set(refs.map((ref) => ref.chunkId))];
	const placeholders = (values: string[]) => values.map(() => '?').join(', ');

	const result = await databaseClient.execute({
		sql: `SELECT id, position, totalChunks FROM (
				SELECT
					dc.id AS id,
					ROW_NUMBER() OVER (
						PARTITION BY dc.document_id
						ORDER BY dc.page_index, dc.chunk_index
					) AS position,
					COUNT(*) OVER (PARTITION BY dc.document_id) AS totalChunks
				FROM document_chunks dc
				WHERE dc.document_id IN (${placeholders(documentIds)})
			)
			WHERE id IN (${placeholders(chunkIds)})`,
		args: [...documentIds, ...chunkIds]
	});

	for (const row of result.rows) {
		positions.set(String(row.id), {
			position: Number(row.position),
			totalChunks: Number(row.totalChunks)
		});
	}

	return positions;
}
