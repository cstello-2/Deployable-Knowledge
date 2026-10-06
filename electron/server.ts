import { createServer, type RequestListener } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ServerMessage {
	type: 'listening';
	port: number;
}

const appRoot = process.env.DK_APP_ROOT;
if (!appRoot) throw new Error('DK_APP_ROOT is required to locate the SvelteKit build.');

const { handler }: { handler: RequestListener } = await import(
	pathToFileURL(join(appRoot, 'build', 'handler.js')).href
);

const server = createServer(handler);

server.listen(0, '127.0.0.1', () => {
	const address = server.address();
	if (typeof address !== 'object' || address === null) {
		throw new Error('The local server did not bind to a TCP port.');
	}
	process.send?.({ type: 'listening', port: address.port } satisfies ServerMessage);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, () => server.close());
}
