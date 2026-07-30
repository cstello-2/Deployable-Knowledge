<script lang="ts">
	import Wrench from '@lucide/svelte/icons/wrench';
	import { SettingsManageButtons, SettingsToolsSection } from '$lib/components/app/settings';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { settingsStore } from '$lib/stores';
</script>

<svelte:head>
	<title>Tool settings · Deployable Knowledge</title>
</svelte:head>

<section class="grid gap-5" aria-labelledby="tools-heading">
	<header class="flex items-center gap-3">
		<Wrench class="size-5 shrink-0" />
		<div class="grid gap-1">
			<h2 id="tools-heading" class="text-base font-semibold">Tools</h2>
			<p class="m-0 text-xs text-muted-foreground">
				Enabled tools are offered to the model along with their usage instructions; disabled tools
				are removed from the prompt entirely.
			</p>
		</div>
	</header>

	{#if !settingsStore.ready}
		<div class="grid gap-3">
			<Skeleton class="h-16" /><Skeleton class="h-24" />
		</div>
	{:else}
		<div class="grid gap-5">
			<SettingsToolsSection />
			<SettingsManageButtons />
		</div>
	{/if}
</section>
