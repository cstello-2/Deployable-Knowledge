import { API_CHUNK_RATINGS } from '$lib/constants';
import type {
	ApiChunkRatingDeleteRequest,
	ApiChunkRatingRequest,
	ApiChunkRatingResponse
} from '$lib/types';
import { apiDelete, apiPatch } from '$lib/utils';

export class ChunkRatingsService {
	static set(chunkId: string, request: ApiChunkRatingRequest) {
		return apiPatch<ApiChunkRatingResponse, ApiChunkRatingRequest>(
			API_CHUNK_RATINGS.byChunkId(chunkId),
			request
		);
	}

	static clear(chunkId: string, request: ApiChunkRatingDeleteRequest) {
		return apiDelete<ApiChunkRatingResponse, ApiChunkRatingDeleteRequest>(
			API_CHUNK_RATINGS.byChunkId(chunkId),
			request
		);
	}
}
