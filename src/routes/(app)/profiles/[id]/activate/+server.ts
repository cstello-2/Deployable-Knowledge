import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { db } from '$lib/server/database/database';
import { setActiveProfileId } from '$lib/server/database/app-state';
import { profiles, type AssistantProfileActivationResponse } from '$lib/server/database/schema';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const profile = await db.select().from(profiles).where(eq(profiles.id, params.id)).get();

	if (!profile) {
		throw error(404, 'Profile not found');
	}

	await setActiveProfileId(profile.id);

	const response: AssistantProfileActivationResponse = {
		profile,
		activeProfileId: profile.id
	};

	return json(response);
};
