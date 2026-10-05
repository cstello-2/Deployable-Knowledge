import { json } from '@sveltejs/kit';
import { SessionsRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await SessionsRepository.list());
};

export const POST: RequestHandler = async () => {
	return json(await SessionsRepository.create(), { status: 201 });
};
