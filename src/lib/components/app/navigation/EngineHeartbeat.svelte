<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	interface HeartbeatResponse {
		checkedAt?: string;
		status?: string;
	}

	const POLL_INTERVAL_MS = 25_000;
	const REQUEST_TIMEOUT_MS = 10_000;
	const FAILURE_THRESHOLD = 3;

	let lastCheckedAt = $state<string | null>(null);
	let failures = $state(0);
	let checking = false;

	const disconnected = $derived(failures >= FAILURE_THRESHOLD);
	const title = $derived(
		`Engine offline${lastCheckedAt ? `. Last checked ${new Date(lastCheckedAt).toLocaleTimeString()}.` : ''}`
	);

	async function checkHeartbeat(): Promise<void> {
		// A hidden tab gets throttled and its requests can be cut short; those
		// failures say nothing about the server, so skip them entirely.
		if (checking || document.hidden) return;
		checking = true;
		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			if (!navigator.onLine) throw new Error('Browser is offline');
			const response = await fetch(resolve('/heartbeat'), {
				cache: 'no-store',
				headers: { Accept: 'application/json' },
				signal: controller.signal
			});
			const body = (await response.json()) as HeartbeatResponse;
			const healthy = response.ok && body.status === 'online';
			failures = healthy ? 0 : failures + 1;
			lastCheckedAt = body.checkedAt ?? new Date().toISOString();
		} catch {
			failures += 1;
			lastCheckedAt = new Date().toISOString();
		} finally {
			window.clearTimeout(timeout);
			checking = false;
		}
	}

	onMount(() => {
		const handleOnline = () => void checkHeartbeat();
		// The browser reporting itself offline is authoritative, so skip the count
		const handleOffline = () => {
			failures = FAILURE_THRESHOLD;
			lastCheckedAt = new Date().toISOString();
		};
		// Coming back from a hidden tab or a sleeping machine starts clean rather
		// than showing a banner for polls that never really ran
		const handleVisibility = () => {
			if (document.hidden) return;
			failures = 0;
			void checkHeartbeat();
		};

		void checkHeartbeat();
		const interval = window.setInterval(() => void checkHeartbeat(), POLL_INTERVAL_MS);
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			window.clearInterval(interval);
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});
</script>

{#if disconnected}
	<div
		class="fixed right-4 bottom-4 left-4 z-[var(--layer-toast,1000001)] mx-auto flex max-w-xl items-start gap-3 rounded-lg border border-red-500/50 bg-red-50 px-4 py-3 text-red-950 shadow-lg dark:bg-red-950 dark:text-red-50"
		role="alert"
		aria-live="assertive"
		{title}
	>
		<span
			class="mt-1 size-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_0_3px_rgb(239_68_68_/_0.18)]"
			aria-hidden="true"
		></span>
		<div class="min-w-0">
			<p class="m-0 text-sm font-semibold">Engine disconnected</p>
			<p class="m-0 text-xs opacity-80">
				The server cannot be reached. Reconnecting automatically…
			</p>
		</div>
	</div>
{/if}
