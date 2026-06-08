<script lang="ts">
	import { onMount } from 'svelte';
	import '@material-design-icons/font/filled.css';
	import '$lib/styles/base.css';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { initWindowStateStorage } from '$lib/windowState';

	let { children } = $props();

	onMount(() => {
		initWindowStateStorage();
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
