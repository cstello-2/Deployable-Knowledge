<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	interface HeartbeatResponse {
		checkedAt?: string;
		status?: string;
	}

	const POLL_INTERVAL_MS = 5_000;
	const REQUEST_TIMEOUT_MS = 3_000;

	let checked = $state(false);
	let lastCheckedAt = $state<string | null>(null);
	let online = $state(false);
	let checking = false;

	const title = $derived(
		`Engine offline${lastCheckedAt ? `. Last checked ${new Date(lastCheckedAt).toLocaleTimeString()}.` : ''}`
	);

	async function checkHeartbeat(): Promise<void> {
		if (checking) return;
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
			online = response.ok && body.status === 'online';
			lastCheckedAt = body.checkedAt ?? new Date().toISOString();
		} catch {
			online = false;
			lastCheckedAt = new Date().toISOString();
		} finally {
			window.clearTimeout(timeout);
			checked = true;
			checking = false;
		}
	}

	onMount(() => {
		const handleOnline = () => void checkHeartbeat();
		const handleOffline = () => {
			online = false;
			checked = true;
			lastCheckedAt = new Date().toISOString();
		};

		void checkHeartbeat();
		const interval = window.setInterval(() => void checkHeartbeat(), POLL_INTERVAL_MS);
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.clearInterval(interval);
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

{#if checked && !online}
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
