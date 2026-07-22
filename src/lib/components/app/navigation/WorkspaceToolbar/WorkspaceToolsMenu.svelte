<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import Eye from '@lucide/svelte/icons/eye';
	import { ActionIcon } from '$lib/components/app/actions';
	import { windowDefinitions } from '$lib/components/app/workspace/window-registry';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { workspaceStore } from '$lib/stores';

	function showWindow(id: string): void {
		workspaceStore.showWindow(id);
		void goto(resolve('/'));
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<ActionIcon class="size-7 rounded-md" label="Workspace windows" triggerProps={props}>
				<Eye />
			</ActionIcon>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-56" side="bottom" sideOffset={8}>
		<DropdownMenu.Label>Workspace windows</DropdownMenu.Label>
		{#each windowDefinitions as definition (definition.id)}
			{@const WindowIcon = definition.icon}
			<DropdownMenu.Item onclick={() => showWindow(definition.id)}>
				<WindowIcon />
				<span class="flex-1">{definition.title}</span>
				{#if workspaceStore.isWindowVisible(definition.id)}
					<Check class="size-3.5" />
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
