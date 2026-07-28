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

	const label = $derived(
		!checked ? 'Checking engine' : online ? 'Engine online' : 'Engine offline'
	);
	const title = $derived(
		`${label}${lastCheckedAt ? `. Last checked ${new Date(lastCheckedAt).toLocaleTimeString()}.` : ''}`
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

<div
	class={[
		'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold',
		checked && online
			? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
			: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400'
	]}
	role="status"
	aria-live="polite"
	{title}
>
	<span
		class={[
			'size-2 rounded-full',
			checked && online
				? 'bg-green-500 shadow-[0_0_0_3px_rgb(34_197_94_/_0.15)]'
				: 'bg-red-500 shadow-[0_0_0_3px_rgb(239_68_68_/_0.15)]'
		]}
		aria-hidden="true"
	></span>
	<span class="hidden sm:inline">{label}</span>
</div>
