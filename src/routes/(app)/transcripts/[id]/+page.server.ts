import { error } from '@sveltejs/kit';
import { DocumentsRepository } from '$lib/server/repositories';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const transcript = await DocumentsRepository.transcript(params.id);

	if (!transcript) throw error(404, 'Document not found.');
	const { sourceType } = transcript.document;
	if (sourceType !== 'AUDIO' && sourceType !== 'YOUTUBE') {
		throw error(400, 'This document is not a transcript.');
	}

	const requested = url.searchParams.get('chunk')?.trim();
	const parsed = requested ? Number(requested) : Number.NaN;
	const focusChunkIndex = Number.isInteger(parsed) && parsed >= 0 ? parsed : null;

	return { ...transcript, focusChunkIndex };
};
