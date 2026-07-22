<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { ActionIcon } from '$lib/components/app/actions';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	interface Props {
		label: string;
		onDelete: () => void;
		onRename: () => void;
	}

	let { label, onDelete, onRename }: Props = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<ActionIcon
				class="mr-2 size-7 border-0 bg-transparent shadow-none"
				label={`${label} actions`}
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
