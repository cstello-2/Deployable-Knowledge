<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import { Toaster } from 'svelte-sonner';
	import packageMetadata from '../../../package.json';
	import favicon from '$lib/assets/icon.svg';
	import { DialogProgress } from '$lib/components/app/dialogs';
	import { AppStartupOverlay } from '$lib/components/app/navigation';
	import { SettingsDialog } from '$lib/components/app/settings';
	import EngineHeartbeat from '$lib/components/app/navigation/EngineHeartbeat.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { settingsStore, setupStore, themeStore, workspaceStore } from '$lib/stores';

	let { children } = $props();
	let framesPainted = $state(false);
	// The workspace layout arrives from the database, so the overlay has to cover
	// that fetch or the tab strip renders empty first.
	const layoutReady = $derived(framesPainted && workspaceStore.ready);

	onMount(() => {
		themeStore.init();
		void workspaceStore.init();
		void settingsStore.init();
		void setupStore.init();

		let secondFrame = 0;
		const firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(() => (framesPainted = true));
		});

		return () => {
			cancelAnimationFrame(firstFrame);
			cancelAnimationFrame(secondFrame);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Tooltip.Provider delayDuration={300}>
	<div class="h-screen min-h-0 bg-background text-foreground">
		{@render children()}
	</div>

	<Toaster richColors />
	<EngineHeartbeat />
	<SettingsDialog />

	<DialogProgress
		open={setupStore.open}
		title="Preparing semantic search"
		progress={setupStore.progress}
		error={setupStore.error ?? ''}
		errorTitle="Semantic search setup failed"
		errorDetail="You can continue without semantic search and retry later."
		onRetry={() => void setupStore.install()}
		onClose={() => (setupStore.open = false)}
	/>

	<AppStartupOverlay ready={layoutReady} version={packageMetadata.version} />
</Tooltip.Provider>
