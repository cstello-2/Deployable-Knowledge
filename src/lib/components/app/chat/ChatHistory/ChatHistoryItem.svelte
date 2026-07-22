<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { ActionIcon } from '$lib/components/app/actions';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import type { Session } from '$lib/types';

	interface Props {
		active?: boolean;
		onDelete: () => void;
		onRename: () => void;
		onSelect: () => void;
		session: Session;
	}

	let { active = false, onDelete, onRename, onSelect, session }: Props = $props();

	function formatDate(value: string | number | Date | null): string {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? String(value)
			: date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
	}
</script>

<div
	class={[
		'dk-panel grid grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden rounded-xl border transition-[background-color,border-color] hover:bg-muted/60 focus-within:border-ring',
		active && 'border-primary bg-primary/10'
	]}
>
	<button
		class="grid min-w-0 cursor-pointer gap-0.5 bg-transparent px-3 py-2 text-left outline-none"
		type="button"
		aria-current={active ? 'true' : undefined}
		onclick={onSelect}
	>
		<strong class="truncate text-sm">{session.title || 'Untitled chat'}</strong>
		<span class="text-xs text-muted-foreground">{formatDate(session.updatedAt)}</span>
	</button>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<ActionIcon
					class="mr-2 size-7 border-0 bg-transparent shadow-none"
					label="Chat actions"
					size="icon-sm"
					triggerProps={props}
					variant="ghost"
				>
					<Ellipsis />
				</ActionIcon>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-36" sideOffset={4}>
			<DropdownMenu.Item onclick={onRename}>
				<Pencil />
				Rename
			</DropdownMenu.Item>
			<DropdownMenu.Item onclick={onDelete} variant="destructive">
				<Trash2 />
				Delete
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
