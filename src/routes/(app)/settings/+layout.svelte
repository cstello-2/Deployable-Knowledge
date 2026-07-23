<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { SettingsNav } from '$lib/components/app/settings';
	import { Button } from '$lib/components/ui/button';
	import { settingsStore } from '$lib/stores';

	let { children } = $props();

	onMount(async () => {
		await settingsStore.init();
		if (settingsStore.error) toast.error(settingsStore.error);
	});
</script>

<main
	class="h-full overflow-y-auto bg-linear-to-b from-card to-elevated [scrollbar-gutter:stable]"
	aria-labelledby="settings-page-title"
>
	<div class="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
		<header class="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
			<h1 id="settings-page-title" class="text-2xl font-semibold tracking-tight">Settings</h1>
			<Button href="/" variant="outline"><ArrowLeft /> Back to workspace</Button>
		</header>

		<div class="grid gap-5 md:grid-cols-[11rem_minmax(0,1fr)] md:items-start">
			<SettingsNav />
			<div class="grid min-w-0 gap-5">
				{@render children()}
			</div>
		</div>
	</div>
</main>
