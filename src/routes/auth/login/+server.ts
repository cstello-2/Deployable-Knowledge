import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { createSession } from '$lib/server/auth/utils';
import { seedLocalUser, localUsername } from '$lib/server/database/seed';

export const GET: RequestHandler = async ({ cookies }) => {
	// In the future we would take username and password from the body
	// const body = await request.json();

	// For now we just give session tokens to our local user
	await seedLocalUser();
	const session = await createSession(localUsername);

	cookies.delete('session_token', { path: '/' });

	cookies.set('session_token', session.token!, {
		httpOnly: true,
		// `vite dev` serves plain http, where Secure cookies are dropped.
		secure: !dev,
		path: '/'
	});

	throw redirect(303, '/');
};
