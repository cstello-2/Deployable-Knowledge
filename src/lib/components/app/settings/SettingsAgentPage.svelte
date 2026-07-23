<script lang="ts">
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { settingsStore } from '$lib/stores';
	import SettingsGenerationFields from './SettingsGenerationFields.svelte';
	import SettingsManageButtons from './SettingsManageButtons.svelte';
	import SettingsModelSelector from './SettingsModelSelector.svelte';
	import SettingsPersonaField from './SettingsPersonaField.svelte';
	import SettingsProfileSelector from './SettingsProfileSelector.svelte';
	import SettingsPromptTemplateSelector from './SettingsPromptTemplateSelector.svelte';
	import SettingsRetrievalSection from './SettingsRetrievalSection.svelte';
</script>

<section class="grid gap-5" aria-labelledby="assistant-heading">
	<header class="flex items-center gap-3">
		<SlidersHorizontal class="size-5 shrink-0" />
		<div class="grid gap-1">
			<h2 id="assistant-heading" class="text-base font-semibold">Assistant configuration</h2>
			<p class="m-0 text-xs text-muted-foreground">
				Profiles keep model, prompt, generation, and retrieval choices together.
			</p>
		</div>
	</header>

	{#if !settingsStore.ready}
		<div class="grid gap-3">
			<Skeleton class="h-16" /><Skeleton class="h-24" /><Skeleton class="h-40" />
		</div>
	{:else}
		<div class="grid gap-5">
			<SettingsProfileSelector />
			<div class="grid gap-5 md:grid-cols-2">
				<SettingsModelSelector />
				<SettingsPromptTemplateSelector />
			</div>
			<div class="grid items-start gap-5 lg:grid-cols-2">
				<SettingsGenerationFields />
				<SettingsRetrievalSection />
			</div>
			<SettingsPersonaField />
			<SettingsManageButtons />
		</div>
	{/if}
</section>
