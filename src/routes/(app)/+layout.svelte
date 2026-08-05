<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import packageMetadata from '../../../package.json';
	import favicon from '$lib/assets/icon.svg';
	import { DialogProgress, DialogWelcome } from '$lib/components/app/dialogs';
	import { AppStartupOverlay } from '$lib/components/app/navigation';
	import EngineHeartbeat from '$lib/components/app/navigation/EngineHeartbeat.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { STORAGE_KEYS } from '$lib/constants';
	import { settingsStore, setupStore, themeStore, welcomeStore, workspaceStore } from '$lib/stores';

	let { children } = $props();
	let layoutReady = $state(false);

	onMount(() => {
		themeStore.init();
		workspaceStore.init();
		void settingsStore.init();
		void setupStore.init();
		welcomeStore.init();

		let secondFrame = 0;
		const firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(() => (layoutReady = true));
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

	<ModeWatcher
		defaultTheme="classic"
		disableHeadScriptInjection
		modeStorageKey={STORAGE_KEYS.THEME_MODE}
		themeStorageKey={STORAGE_KEYS.THEME_COLOR}
	/>
	<Toaster richColors />
	<EngineHeartbeat />

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

	<DialogWelcome
		open={welcomeStore.open}
		onOpenChange={(open) => (open ? welcomeStore.show() : welcomeStore.close())}
	/>
</Tooltip.Provider>
