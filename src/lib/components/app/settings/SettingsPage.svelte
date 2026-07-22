<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { DialogApiKeys } from '$lib/components/app/dialogs';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { settingsStore } from '$lib/stores';
	import SettingsAppearance from './SettingsAppearance.svelte';
	import SettingsGenerationFields from './SettingsGenerationFields.svelte';
	import SettingsManageButtons from './SettingsManageButtons.svelte';
	import SettingsModelSelector from './SettingsModelSelector.svelte';
	import SettingsPersonaField from './SettingsPersonaField.svelte';
	import SettingsProfileSelector from './SettingsProfileSelector.svelte';
	import SettingsPromptTemplateSelector from './SettingsPromptTemplateSelector.svelte';
	import SettingsRetrievalSection from './SettingsRetrievalSection.svelte';

	let apiKeysOpen = $state(false);

	onMount(async () => {
		await settingsStore.init();
		if (settingsStore.error) toast.error(settingsStore.error);
	});
</script>

<main
	class="h-full overflow-y-auto bg-background [scrollbar-gutter:stable]"
	aria-labelledby="settings-page-title"
>
	<div class="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
		<header class="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
			<div class="grid gap-1">
				<h1 id="settings-page-title" class="text-2xl font-semibold tracking-tight">Settings</h1>
				<p class="m-0 text-sm text-muted-foreground">
					Manage appearance, assistant profiles, models, prompts, and retrieval behavior.
				</p>
			</div>
			<Button href="/" variant="outline"><ArrowLeft /> Back to workspace</Button>
		</header>

		<SettingsAppearance />

		<section class="dk-panel grid gap-5 rounded-xl border p-5" aria-labelledby="assistant-heading">
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
						<SettingsModelSelector onManageApiKeys={() => (apiKeysOpen = true)} />
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
	</div>
</main>

<DialogApiKeys
	open={apiKeysOpen}
	onOpenChange={(open) => (apiKeysOpen = open)}
	onChanged={() => settingsStore.loadProviders()}
/>
