<script lang="ts">
	import { resolve } from '$app/paths';
	import Settings from '@lucide/svelte/icons/settings';
	import UserRound from '@lucide/svelte/icons/user-round';
	import { ActionIcon } from '$lib/components/app/actions';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import EngineHeartbeat from '../EngineHeartbeat.svelte';
</script>

<div class="ml-1 flex shrink-0 items-center gap-1 border-l pl-1" aria-label="Application controls">
	<EngineHeartbeat />
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					aria-label="Settings"
					class="size-7 rounded-md"
					href={resolve('/settings')}
					size="icon"
					variant="outline"
				>
					<Settings />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="bottom">Settings</Tooltip.Content>
	</Tooltip.Root>

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<ActionIcon class="size-7 rounded-md" label="User" triggerProps={props}>
					<UserRound />
				</ActionIcon>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-48" side="bottom" sideOffset={8}>
			<DropdownMenu.Label>local-user</DropdownMenu.Label>
			<DropdownMenu.Item disabled>Logout</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
