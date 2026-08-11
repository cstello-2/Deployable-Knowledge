<script lang="ts">
	import Bold from '@lucide/svelte/icons/bold';
	import Code from '@lucide/svelte/icons/code';
	import Heading1 from '@lucide/svelte/icons/heading-1';
	import Highlighter from '@lucide/svelte/icons/highlighter';
	import Heading2 from '@lucide/svelte/icons/heading-2';
	import Heading3 from '@lucide/svelte/icons/heading-3';
	import Italic from '@lucide/svelte/icons/italic';
	import Link from '@lucide/svelte/icons/link';
	import List from '@lucide/svelte/icons/list';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import Palette from '@lucide/svelte/icons/palette';
	import SquareCode from '@lucide/svelte/icons/square-code';
	import Strikethrough from '@lucide/svelte/icons/strikethrough';
	import TextQuote from '@lucide/svelte/icons/text-quote';
	import { ActionIcon } from '$lib/components/app/actions';
	import * as Popover from '$lib/components/ui/popover';
	import { Separator } from '$lib/components/ui/separator';
	import type { RibbonCommand } from './notebook-editing';

	interface Props {
		onCommand: (command: RibbonCommand) => void;
	}

	let { onCommand }: Props = $props();
	let colorOpen = $state(false);
	let highlightOpen = $state(false);

	const COLORS = [
		{ label: 'Red', value: '#dc2626' },
		{ label: 'Orange', value: '#ea580c' },
		{ label: 'Yellow', value: '#ca8a04' },
		{ label: 'Green', value: '#16a34a' },
		{ label: 'Blue', value: '#2563eb' },
		{ label: 'Violet', value: '#7c3aed' },
		{ label: 'Pink', value: '#db2777' },
		{ label: 'Gray', value: '#6b7280' }
	];

	// Pale enough that the dark text set by .nb-highlight stays readable
	const HIGHLIGHTS = [
		{ label: 'Yellow', value: '#fef08a' },
		{ label: 'Orange', value: '#fed7aa' },
		{ label: 'Green', value: '#bbf7d0' },
		{ label: 'Teal', value: '#99f6e4' },
		{ label: 'Blue', value: '#bfdbfe' },
		{ label: 'Violet', value: '#e9d5ff' },
		{ label: 'Pink', value: '#fbcfe8' },
		{ label: 'Gray', value: '#e5e7eb' }
	];

	function pickColor(value: string): void {
		colorOpen = false;
		onCommand({ color: value });
	}

	function pickHighlight(value: string): void {
		highlightOpen = false;
		onCommand({ highlight: value });
	}
</script>

<div
	class="flex flex-wrap items-center gap-0.5 border-b bg-card/50 px-2 py-1"
	role="toolbar"
	aria-label="Text formatting"
>
	<ActionIcon class="size-7" label="Bold (Ctrl+B)" variant="ghost" onclick={() => onCommand('bold')}
		><Bold /></ActionIcon
	>
	<ActionIcon
		class="size-7"
		label="Italic (Ctrl+I)"
		variant="ghost"
		onclick={() => onCommand('italic')}><Italic /></ActionIcon
	>
	<ActionIcon
		class="size-7"
		label="Strikethrough"
		variant="ghost"
		onclick={() => onCommand('strikethrough')}><Strikethrough /></ActionIcon
	>
	<Popover.Root bind:open={colorOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<ActionIcon class="size-7" label="Text color" triggerProps={props} variant="ghost"
					><Palette /></ActionIcon
				>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="start" class="w-auto p-2">
			<div class="grid grid-cols-4 gap-1.5">
				{#each COLORS as color (color.value)}
					<button
						type="button"
						class="size-6 cursor-pointer rounded-full border border-border/60 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						style={`background-color: ${color.value}`}
						title={color.label}
						aria-label={`Color text ${color.label.toLowerCase()}`}
						onclick={() => pickColor(color.value)}
					></button>
				{/each}
			</div>
		</Popover.Content>
	</Popover.Root>
	<Popover.Root bind:open={highlightOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<ActionIcon class="size-7" label="Highlight" triggerProps={props} variant="ghost"
					><Highlighter /></ActionIcon
				>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="start" class="w-auto p-2">
			<div class="grid grid-cols-4 gap-1.5">
				{#each HIGHLIGHTS as color (color.value)}
					<button
						type="button"
						class="size-6 cursor-pointer rounded-full border border-border/60 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						style={`background-color: ${color.value}`}
						title={color.label}
						aria-label={`Highlight text ${color.label.toLowerCase()}`}
						onclick={() => pickHighlight(color.value)}
					></button>
				{/each}
			</div>
		</Popover.Content>
	</Popover.Root>
	<Separator orientation="vertical" class="mx-1 h-5!" />
	<ActionIcon class="size-7" label="Heading 1" variant="ghost" onclick={() => onCommand('h1')}
		><Heading1 /></ActionIcon
	>
	<ActionIcon class="size-7" label="Heading 2" variant="ghost" onclick={() => onCommand('h2')}
		><Heading2 /></ActionIcon
	>
	<ActionIcon class="size-7" label="Heading 3" variant="ghost" onclick={() => onCommand('h3')}
		><Heading3 /></ActionIcon
	>
	<Separator orientation="vertical" class="mx-1 h-5!" />
	<ActionIcon
		class="size-7"
		label="Bulleted list"
		variant="ghost"
		onclick={() => onCommand('bullet-list')}><List /></ActionIcon
	>
	<ActionIcon
		class="size-7"
		label="Numbered list"
		variant="ghost"
		onclick={() => onCommand('ordered-list')}><ListOrdered /></ActionIcon
	>
	<ActionIcon class="size-7" label="Quote" variant="ghost" onclick={() => onCommand('quote')}
		><TextQuote /></ActionIcon
	>
	<Separator orientation="vertical" class="mx-1 h-5!" />
	<ActionIcon class="size-7" label="Inline code" variant="ghost" onclick={() => onCommand('code')}
		><Code /></ActionIcon
	>
	<ActionIcon
		class="size-7"
		label="Code block"
		variant="ghost"
		onclick={() => onCommand('code-block')}><SquareCode /></ActionIcon
	>
	<ActionIcon class="size-7" label="Link" variant="ghost" onclick={() => onCommand('link')}
		><Link /></ActionIcon
	>
</div>
