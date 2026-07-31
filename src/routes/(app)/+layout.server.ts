import type { LayoutServerLoad } from './$types';
import { validateSessionToken, getUserById } from '$lib/server/auth/utils';
import { redirect } from '@sveltejs/kit';

// Runs on page load for anything under `(app)`
export const load: LayoutServerLoad = async ({ cookies }) => {
	const sessionToken = cookies.get('session_token');

	if (sessionToken === undefined) {
		throw redirect(307, '/auth/login');
	}

	const session = await validateSessionToken(sessionToken);

	if (!session) {
		cookies.delete('session_token', { path: '/' });
		throw redirect(307, '/auth/login');
	}

	return {
		user: await getUserById(session.userId!)
	};
};
