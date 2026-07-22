<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import X from '@lucide/svelte/icons/x';
	import { ActionIcon } from '$lib/components/app/actions';
	import type { Snippet } from 'svelte';

	interface Props {
		collapsed?: boolean;
		collapsible?: boolean;
		closable?: boolean;
		headerActions?: Snippet;
		onClose?: () => void;
		onToggleCollapse?: () => void;
		title: string;
	}

	let {
		collapsed = false,
		collapsible = true,
		closable = false,
		headerActions,
		onClose = () => {},
		onToggleCollapse = () => {},
		title
	}: Props = $props();
</script>

<header
	class="workspace-titlebar grid h-(--titlebar-height) shrink-0 cursor-grab grid-cols-[minmax(0,1fr)_auto] items-center border-b px-3 select-none"
	data-window-handle
>
	<div class="flex min-w-0 items-center gap-2">
		<GripVertical class="size-4 shrink-0 text-muted-foreground" />
		<div class="truncate text-sm font-semibold tracking-[0.015em]">{title}</div>
	</div>

	{#if headerActions || closable || collapsible}
		<div class="flex items-center gap-1.5" data-window-action>
			{#if headerActions}
				{@render headerActions()}
			{/if}
			{#if collapsible}
				<ActionIcon
					variant="outline"
					class="size-7"
					label={collapsed ? 'Expand' : 'Collapse'}
					pressed={collapsed}
					onclick={onToggleCollapse}
				>
					{#if collapsed}<ChevronDown />{:else}<ChevronUp />{/if}
				</ActionIcon>
			{/if}
			{#if closable}
				<ActionIcon variant="outline" class="size-7" label="Close" onclick={onClose}>
					<X />
				</ActionIcon>
			{/if}
		</div>
	{/if}
</header>
