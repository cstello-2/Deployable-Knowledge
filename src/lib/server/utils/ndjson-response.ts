export function ndjsonTaskResponse<TEvent>(
	name: string,
	run: (send: (event: TEvent) => void) => Promise<void>,
	errorEvent: (cause: unknown) => TEvent
): Response {
	let closed = false;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const send = (event: TEvent) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
				} catch {
					closed = true;
				}
			};

			void (async () => {
				try {
					await run(send);
				} catch (cause) {
					console.error(`${name} failed.`);
					send(errorEvent(cause));
				} finally {
					if (!closed) {
						try {
							controller.close();
						} catch {
							closed = true;
						}
					}
				}
			})().catch(() => {
				console.error(`${name} stream failed.`);
			});
		},
		cancel() {
			closed = true;
		}
	});

	return new Response(stream, {
		headers: {
			'Cache-Control': 'no-cache',
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'X-Accel-Buffering': 'no'
		}
	});
}
