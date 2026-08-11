/**
 * Child-process entry for the packaged desktop app.
 *
 * Electron's main process spawns this with `ELECTRON_RUN_AS_NODE=1` and the
 * per-user data directory as the working directory, because the SvelteKit
 * server resolves `app.db`, `documents/`, `models/`, `.cache/`, and the
 * Tesseract language data relative to `process.cwd()`.
 */
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const appRoot = process.env.DK_APP_ROOT;
if (!appRoot) throw new Error('DK_APP_ROOT is required to locate the SvelteKit build.');

const { handler } = await import(pathToFileURL(join(appRoot, 'build', 'handler.js')).href);

const server = createServer(handler);

server.listen(0, '127.0.0.1', () => {
	const address = server.address();
	if (typeof address !== 'object' || address === null) {
		throw new Error('The local server did not bind to a TCP port.');
	}
	process.send?.({ type: 'listening', port: address.port });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
	// `hooks.server.ts` owns the shutdown sequence and calls `process.exit`, so
	// this only has to stop accepting new connections.
	process.once(signal, () => server.close());
}
