<script lang="ts">
	import Settings from '@lucide/svelte/icons/settings';
	import { Button } from '$lib/components/ui/button';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { settingsDialogStore } from '$lib/stores';
</script>

<div class="ml-1 flex shrink-0 items-center gap-1 border-l pl-1" aria-label="Application controls">
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					aria-label="Settings"
					class="size-7 rounded-md"
					size="icon"
					variant="outline"
					onclick={() => settingsDialogStore.show()}
				>
					<Settings />
				</Button>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="bottom">Settings</Tooltip.Content>
	</Tooltip.Root>
</div>
