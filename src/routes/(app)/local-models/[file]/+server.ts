import { json } from '@sveltejs/kit';

import { deleteLocalModel } from '$lib/server/providers/llamacpp-runtime';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		await deleteLocalModel(params.file);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Could not delete the model.';
		return json({ error: message }, { status: 400 });
	}

	return json({ fileName: params.file, deleted: true });
};
