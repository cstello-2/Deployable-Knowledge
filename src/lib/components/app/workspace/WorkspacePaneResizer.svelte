<script lang="ts">
	import { paneResize } from '$lib/actions';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { workspaceStore } from '$lib/stores';

	interface Props {
		after: { id: string; collapsed: boolean };
		before: { id: string; collapsed: boolean };
	}

	let { after, before }: Props = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				class="relative h-px min-h-px w-full shrink-0 cursor-row-resize border-0 bg-border/70 p-0 before:absolute before:inset-x-0 before:-inset-y-1.5 hover:bg-primary/45"
				type="button"
				aria-label="Resize windows"
				data-window-action
				use:paneResize={{
					afterId: after.id,
					afterCollapsed: after.collapsed,
					beforeId: before.id,
					beforeCollapsed: before.collapsed,
					onResize: (updates) => workspaceStore.setWindowHeights(updates)
				}}
			></button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content>Resize windows</Tooltip.Content>
</Tooltip.Root>
