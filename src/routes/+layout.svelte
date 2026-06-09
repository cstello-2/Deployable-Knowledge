<script lang="ts">
	import { onMount } from 'svelte';
	import 'material-symbols/rounded.css';
	import '$lib/styles/base.css';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { initLayoutPresetStorage } from '$lib/layoutPresets';
	import { initWindowStateStorage } from '$lib/windowState';

	let { children } = $props();

	onMount(() => {
		initWindowStateStorage();
		initLayoutPresetStorage();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
	<AppHeader />
	<div class="app-content">
		{@render children()}
	</div>
</div>

<style>
	.app-shell {
		display: flex;
		height: 100vh;
		min-height: 0;
		background: var(--bg);
		flex-direction: column;
	}

	.app-content {
		min-height: 0;
		flex: 1 1 auto;
	}
</style>
