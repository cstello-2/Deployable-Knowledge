<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Search from '@lucide/svelte/icons/search';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { ActionIcon } from '$lib/components/app/actions';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	interface Props {
		disabled?: boolean;
		notebookMode: boolean;
		onNotebookModeChange: (enabled: boolean) => void;
		onSearchChange: (enabled: boolean) => void;
		onToolsChange: (enabled: boolean) => void;
		searchEnabled: boolean;
		searchToolActive: boolean;
		toolsEnabled: boolean;
		toolsSupported: boolean;
	}

	let {
		disabled = false,
		notebookMode,
		onNotebookModeChange,
		onSearchChange,
		onToolsChange,
		searchEnabled,
		searchToolActive,
		toolsEnabled,
		toolsSupported
	}: Props = $props();

	let activeModes = $derived(
		[notebookMode && 'notebook', toolsEnabled && 'tools', searchEnabled && 'search']
			.filter(Boolean)
			.join(', ')
	);

	let searchDescription = $derived.by(() => {
		if (notebookMode) return 'Not used in notebook mode';
		if (searchToolActive) return 'Handled by the search tool';
		return 'Search documents before replying';
	});
</script>

{#snippet modeLabel(title: string, description: string)}
	<span class="grid min-w-0 gap-0.5">
		<span class="font-medium">{title}</span>
		<span class="text-[11px] text-muted-foreground">{description}</span>
	</span>
{/snippet}

<DropdownMenu.Root>
	<DropdownMenu.Trigger {disabled}>
		{#snippet child({ props })}
			<ActionIcon
				class="size-8 rounded-full bg-transparent text-foreground/40 shadow-none hover:bg-transparent hover:text-foreground active:translate-y-0 aria-expanded:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:aria-expanded:text-foreground"
				{disabled}
				label={activeModes ? `Chat modes: ${activeModes}` : 'Chat modes: plain chat'}
				triggerProps={props}
				variant="ghost"
			>
				<EllipsisVertical />
			</ActionIcon>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-64" side="top" sideOffset={8}>
		<DropdownMenu.Label>Chat modes</DropdownMenu.Label>
		<DropdownMenu.CheckboxItem
			checked={notebookMode}
			closeOnSelect={false}
			onCheckedChange={onNotebookModeChange}
		>
			<BookOpen />
			{@render modeLabel('Notebook', 'Use the notebook as context')}
		</DropdownMenu.CheckboxItem>
		<DropdownMenu.CheckboxItem
			checked={toolsEnabled}
			closeOnSelect={false}
			disabled={!toolsSupported}
			onCheckedChange={onToolsChange}
		>
			<Wrench />
			{@render modeLabel(
				'Tools',
				toolsSupported ? 'Let the model call tools' : 'Not supported by this model'
			)}
		</DropdownMenu.CheckboxItem>
		<DropdownMenu.CheckboxItem
			checked={searchEnabled}
			closeOnSelect={false}
			disabled={notebookMode || searchToolActive}
			onCheckedChange={onSearchChange}
		>
			<Search />
			{@render modeLabel('Search', searchDescription)}
		</DropdownMenu.CheckboxItem>
	</DropdownMenu.Content>
</DropdownMenu.Root>
