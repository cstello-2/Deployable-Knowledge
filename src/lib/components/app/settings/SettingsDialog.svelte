<script lang="ts">
	import Bot from '@lucide/svelte/icons/bot';
	import Bug from '@lucide/svelte/icons/bug';
	import Cpu from '@lucide/svelte/icons/cpu';
	import FileSearch from '@lucide/svelte/icons/file-search';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import Layers from '@lucide/svelte/icons/layers';
	import MessageSquareQuote from '@lucide/svelte/icons/message-square-quote';
	import Palette from '@lucide/svelte/icons/palette';
	import Search from '@lucide/svelte/icons/search';
	import SearchX from '@lucide/svelte/icons/search-x';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Wrench from '@lucide/svelte/icons/wrench';
	import type { Component } from 'svelte';
	import SettingsApiKeys from './SettingsApiKeys.svelte';
	import SettingsAppearance from './SettingsAppearance.svelte';
	import SettingsFieldGroup from './SettingsFieldGroup.svelte';
	import SettingsGenerationFields from './SettingsGenerationFields.svelte';
	import SettingsLocalModels from './SettingsLocalModels.svelte';
	import SettingsLocalRuntimeSection from './SettingsLocalRuntimeSection.svelte';
	import SettingsModelSelector from './SettingsModelSelector.svelte';
	import SettingsPersonaField from './SettingsPersonaField.svelte';
	import SettingsProfileSelector from './SettingsProfileSelector.svelte';
	import SettingsPromptTemplateSelector from './SettingsPromptTemplateSelector.svelte';
	import SettingsRetrievalSection from './SettingsRetrievalSection.svelte';
	import SettingsToolsSection from './SettingsToolsSection.svelte';
	import { DiagnosticsConsole } from '$lib/components/app/diagnostics';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { settingsDialogStore, settingsStore, type SettingsSection } from '$lib/stores';

	interface SectionDefinition {
		id: SettingsSection;
		label: string;
		description: string;
		icon: Component;
		keywords: string[];
	}

	const sections = $derived<SectionDefinition[]>([
		{
			id: 'agent',
			label: 'Agent',
			description: 'Profiles keep model, prompt, generation, and retrieval choices together.',
			icon: Bot,
			keywords: [
				'profile',
				'provider',
				'model',
				'prompt template',
				'system prompt',
				'persona',
				'temperature',
				'max output tokens',
				'sampling top k',
				'reasoning budget',
				'thinking',
				'agent turns',
				'retrieval mode',
				'semantic',
				'bm25',
				'hybrid',
				'retrieved chunks',
				'rag'
			]
		},
		{
			id: 'tools',
			label: 'Tools',
			description:
				'Enabled tools are offered to the model with their usage instructions; disabled tools are removed from the prompt.',
			icon: Wrench,
			keywords: [
				'tool calls',
				'enable',
				'disable',
				...settingsStore.availableTools.map(({ label }) => label.toLowerCase())
			]
		},
		{
			id: 'models',
			label: 'Models',
			description: 'Local models, the llama.cpp runtime, and hosted provider API keys.',
			icon: HardDrive,
			keywords: [
				'local models',
				'download',
				'llama.cpp',
				'ollama',
				'offline',
				'gguf',
				'context window',
				'context size',
				'gpu',
				'compute device',
				'cuda',
				'vulkan',
				'runtime',
				'api keys',
				'hosted providers'
			]
		},
		{
			id: 'appearance',
			label: 'Appearance',
			description: 'Choose how the workspace looks. Changes are applied immediately.',
			icon: Palette,
			keywords: [
				'theme',
				'color mode',
				'light',
				'dark',
				'system',
				'color theme',
				'classic',
				'purple',
				'blue',
				'yellow',
				'green',
				'high contrast'
			]
		},
		{
			id: 'diagnostics',
			label: 'Diagnostics',
			description: 'Inspect sanitized health checks and recent application activity.',
			icon: Bug,
			keywords: ['console', 'debug', 'download', 'errors', 'events', 'health', 'logs', 'report']
		}
	]);

	let query = $state('');

	function matchedKeyword(section: SectionDefinition, value: string): string | null {
		const needle = value.trim().toLowerCase();
		if (!needle) return null;
		if (section.label.toLowerCase().includes(needle)) return section.label;
		return section.keywords.find((keyword) => keyword.includes(needle)) ?? null;
	}

	const searching = $derived(query.trim().length > 0);
	const visibleSections = $derived(
		searching ? sections.filter((section) => matchedKeyword(section, query)) : sections
	);
	const activeSection = $derived(
		sections.find(({ id }) => id === settingsDialogStore.section) ?? sections[0]
	);

	$effect(() => {
		if (!searching || !visibleSections.length) return;
		if (!visibleSections.some(({ id }) => id === settingsDialogStore.section)) {
			settingsDialogStore.section = visibleSections[0].id;
		}
	});

	function onOpenChange(open: boolean): void {
		settingsDialogStore.open = open;
		if (!open) query = '';
	}
</script>

<Dialog.Root open={settingsDialogStore.open} {onOpenChange}>
	<Dialog.Content
		class="flex h-[min(46rem,88dvh)] w-[min(70rem,calc(100vw-3rem))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
	>
		<Dialog.Description class="sr-only">
			Configure the assistant, tools, models, appearance, and diagnostics.
		</Dialog.Description>

		<aside
			class="flex w-52 shrink-0 flex-col gap-3 border-r bg-linear-to-b from-card/60 to-elevated/70 p-3 sm:w-56"
		>
			<Dialog.Title class="px-1 pt-1 text-sm font-semibold tracking-tight">Settings</Dialog.Title>

			<div class="relative">
				<Search
					class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					placeholder="Search settings"
					aria-label="Search settings"
					class="h-8 pl-8 text-sm"
					bind:value={query}
				/>
			</div>

			<nav class="min-h-0 flex-1 overflow-y-auto" aria-label="Settings sections">
				<ul class="m-0 grid list-none gap-1 p-0">
					{#each visibleSections as section (section.id)}
						{@const active = section.id === settingsDialogStore.section}
						{@const hint = searching ? matchedKeyword(section, query) : null}
						<li>
							<button
								type="button"
								aria-current={active ? 'true' : undefined}
								class={[
									'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm font-medium transition-colors',
									active
										? 'border-border bg-linear-to-b from-card to-background text-foreground shadow-sm'
										: 'border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'
								]}
								onclick={() => (settingsDialogStore.section = section.id)}
							>
								<section.icon class="size-4 shrink-0" />
								<span class="grid min-w-0 gap-0.5">
									<span class="truncate">{section.label}</span>
									{#if hint && hint !== section.label}
										<span class="truncate text-[11px] font-normal text-muted-foreground"
											>{hint}</span
										>
									{/if}
								</span>
							</button>
						</li>
					{:else}
						<li class="px-1 py-2 text-xs text-muted-foreground">No sections match your search.</li>
					{/each}
				</ul>
			</nav>
		</aside>

		<div class="flex min-w-0 flex-1 flex-col">
			{#if searching && !visibleSections.length}
				<div class="grid flex-1 place-items-center p-6">
					<div class="grid justify-items-center gap-2 text-center">
						<SearchX class="size-6 text-muted-foreground" />
						<p class="m-0 text-sm font-medium">No settings found</p>
						<p class="m-0 text-xs text-muted-foreground">
							Nothing matches “{query.trim()}”. Try a different term.
						</p>
					</div>
				</div>
			{:else}
				<header
					class="flex shrink-0 items-center gap-3 border-b bg-linear-to-b from-[var(--chrome-highlight)] to-card px-5 py-4 pr-14"
				>
					<div
						class="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-linear-to-b from-card to-elevated text-foreground"
					>
						<activeSection.icon class="size-4.5" />
					</div>
					<div class="grid min-w-0 gap-0.5">
						<h2 class="m-0 truncate text-sm font-semibold">{activeSection.label}</h2>
						<p class="m-0 truncate text-xs text-muted-foreground">{activeSection.description}</p>
					</div>
				</header>

				<div
					class={[
						'@container min-h-0 flex-1 bg-linear-to-b from-elevated/25 to-elevated/60 px-5 py-4',
						activeSection.id === 'diagnostics'
							? 'overflow-hidden'
							: 'overflow-y-auto [scrollbar-gutter:stable]'
					]}
				>
					{#if activeSection.id === 'agent'}
						{#if !settingsStore.ready}
							<div class="grid gap-3">
								<Skeleton class="h-16" /><Skeleton class="h-24" /><Skeleton class="h-40" />
							</div>
						{:else}
							<div class="grid gap-4">
								<SettingsFieldGroup
									icon={Layers}
									title="Profile"
									hint="Switch between or create named configurations."
								>
									<SettingsProfileSelector />
								</SettingsFieldGroup>
								<SettingsFieldGroup
									icon={Cpu}
									title="Model & prompt"
									hint="The model that answers and the system prompt it starts from."
								>
									<div class="grid items-start gap-4 @2xl:grid-cols-2">
										<SettingsModelSelector />
										<SettingsPromptTemplateSelector />
									</div>
								</SettingsFieldGroup>
								<div class="grid items-start gap-4 @2xl:grid-cols-2">
									<SettingsFieldGroup icon={SlidersHorizontal} title="Generation">
										<SettingsGenerationFields />
									</SettingsFieldGroup>
									<SettingsFieldGroup
										icon={FileSearch}
										title="Retrieval"
										hint="How document context is fetched for answers."
									>
										<SettingsRetrievalSection />
									</SettingsFieldGroup>
								</div>
								<SettingsFieldGroup
									icon={MessageSquareQuote}
									title="Persona"
									hint="Optional style, role, or response guidance."
								>
									<SettingsPersonaField />
								</SettingsFieldGroup>
							</div>
						{/if}
					{:else if activeSection.id === 'tools'}
						{#if !settingsStore.ready}
							<div class="grid gap-3">
								<Skeleton class="h-16" /><Skeleton class="h-24" />
							</div>
						{:else}
							<div class="grid gap-4">
								<SettingsFieldGroup icon={Wrench} title="Available tools">
									<SettingsToolsSection />
								</SettingsFieldGroup>
							</div>
						{/if}
					{:else if activeSection.id === 'models'}
						<div class="grid gap-6">
							<SettingsLocalModels />
							<SettingsLocalRuntimeSection />
							<SettingsApiKeys />
						</div>
					{:else if activeSection.id === 'diagnostics'}
						<DiagnosticsConsole />
					{:else}
						<SettingsAppearance />
					{/if}
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
