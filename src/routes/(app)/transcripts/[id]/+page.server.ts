import { error } from '@sveltejs/kit';
import { DocumentsRepository } from '$lib/server/repositories';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const transcript = await DocumentsRepository.transcript(params.id);

	if (!transcript) throw error(404, 'Document not found.');
	if (transcript.document.sourceType !== 'AUDIO') {
		throw error(400, 'This document is not an audio transcript.');
	}

	const requested = url.searchParams.get('chunk')?.trim();
	const parsed = requested ? Number(requested) : Number.NaN;
	const focusChunkIndex = Number.isInteger(parsed) && parsed >= 0 ? parsed : null;

	return { ...transcript, focusChunkIndex };
};
