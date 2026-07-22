import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { LOCAL_USER_ID } from '$lib/server/database/constants';
import { db } from '$lib/server/database/database';
import { sessions } from '$lib/server/database/schema';
import { SessionsRepository } from '$lib/server/repositories';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json(await SessionsRepository.list());
};

export const POST: RequestHandler = async () => {
	const timestamp = new Date();
	const [row] = await db
		.insert(sessions)
		.values({
			id: randomUUID(),
			userId: LOCAL_USER_ID,
			title: 'New conversation',
			createdAt: timestamp,
			updatedAt: timestamp
		})
		.returning();

	return json(row, { status: 201 });
};
