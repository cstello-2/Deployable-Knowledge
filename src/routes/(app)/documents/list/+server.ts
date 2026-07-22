import { json } from '@sveltejs/kit';
import { DocumentsRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await DocumentsRepository.list());
};
