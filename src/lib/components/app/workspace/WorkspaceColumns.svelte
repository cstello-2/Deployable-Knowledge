<script lang="ts">
	import { onMount } from 'svelte';
	import { WindowColumn } from '$lib/enums';
	import { columnSplitter, windowDragLayout } from '$lib/actions';
	import { workspaceStore } from '$lib/stores';
	import WorkspacePaneResizer from './WorkspacePaneResizer.svelte';
	import { windowDefinitionsById, type WindowDefinition } from './window-registry';
	import type { WindowPlacement } from '$lib/types';

	type WorkspaceWindow = Omit<WindowDefinition, 'column'> & WindowPlacement;
	let columnsElement: HTMLElement;

	function windowsFor(column: WindowColumn): WorkspaceWindow[] {
		const windows: WorkspaceWindow[] = [];
		for (const placement of workspaceStore.visiblePlacements) {
			if (placement.column !== column) continue;
			const definition = windowDefinitionsById.get(placement.id);
			if (definition) windows.push({ ...definition, ...placement });
		}
		return windows;
	}

	function windowHeight(window: WorkspaceWindow, siblings: WorkspaceWindow[]): number | null {
		return siblings.length > 1 ? window.height : null;
	}

	onMount(() => {
		const onWindowDrop = (event: Event) => {
			workspaceStore.placeWindowFromDrop(
				(event as CustomEvent<import('$lib/types').WindowDropPlacement>).detail
			);
		};
		columnsElement.addEventListener('windowdrop', onWindowDrop);
		return () => columnsElement.removeEventListener('windowdrop', onWindowDrop);
	});
</script>

<section
	class="columns relative flex min-h-0 flex-1 overflow-hidden bg-background max-md:flex-col"
	class:left-collapsed={workspaceStore.leftPaneCollapsed}
	class:windows-locked={workspaceStore.windowMovementLocked}
	bind:this={columnsElement}
	use:windowDragLayout={{ disabled: workspaceStore.windowMovementLocked }}
	use:columnSplitter={{
		leftCollapsed: workspaceStore.leftPaneCollapsed,
		leftWidth: workspaceStore.leftPaneWidth,
		onLeftWidthChange: (width) => workspaceStore.setLeftPaneWidth(width)
	}}
	aria-label="Window columns"
>
	{#each [WindowColumn.LEFT, WindowColumn.RIGHT] as column (column)}
		{@const columnWindows = windowsFor(column)}
		{#if column === WindowColumn.RIGHT}
			<div
				class="splitter relative w-px shrink-0 cursor-col-resize bg-border/70 before:absolute before:inset-y-0 before:-left-2 before:-right-2 hover:bg-primary/45 max-md:h-px max-md:w-auto max-md:cursor-row-resize max-md:before:inset-x-0 max-md:before:-top-2 max-md:before:-bottom-2"
				data-splitter
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize columns"
			></div>
		{/if}

		<div
			class="col relative flex min-h-0 min-w-55 flex-1 flex-col overflow-hidden border-r last:border-r-0 max-md:min-h-45 max-md:min-w-0"
			class:hidden={column === WindowColumn.LEFT && workspaceStore.leftPaneCollapsed}
			id={`col-${column}`}
			data-window-column={column}
			data-split-pane={column}
			aria-label={`${column === WindowColumn.LEFT ? 'Left' : 'Right'} column`}
			aria-hidden={column === WindowColumn.LEFT && workspaceStore.leftPaneCollapsed}
		>
			{#each columnWindows as window, index (window.id)}
				{@const WindowComponent = window.component}
				<WindowComponent
					id={window.id}
					title={window.title}
					closable
					height={windowHeight(window, columnWindows)}
					collapsed={window.collapsed}
					onToggleCollapse={() => workspaceStore.toggleWindowCollapsed(window.id)}
					onClose={() => workspaceStore.closeWindow(window.id)}
				/>
				{#if index < columnWindows.length - 1}
					<WorkspacePaneResizer before={window} after={columnWindows[index + 1]} />
				{/if}
			{/each}
		</div>
	{/each}
</section>
