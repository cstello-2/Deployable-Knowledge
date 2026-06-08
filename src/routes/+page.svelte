<script lang="ts">
	import { onMount } from 'svelte';
	import { windowDragLayout } from '$lib/draggable';
	import { columnSplitter } from '$lib/splitter';
	import {
		closeWindow,
		placeWindowFromDrop,
		toggleWindowCollapsed,
		visibleWindows
	} from '$lib/windowState';
	import type { WindowColumn } from '$lib/windows';

	let columnsElement: HTMLElement;

	const columns: { id: WindowColumn; label: string }[] = [
		{ id: 'left', label: 'Left column' },
		{ id: 'right', label: 'Right column' }
	];

	function windowsFor(column: WindowColumn) {
		return $visibleWindows.filter((window) => window.column === column);
	}

	function handleWindowDrop(
		event: CustomEvent<{ windowId: string | null; columnId: string | null; columnIndex: number }>
	) {
		placeWindowFromDrop(event.detail);
	}

	onMount(() => {
		const handler = (event: Event) =>
			handleWindowDrop(event as CustomEvent<Parameters<typeof placeWindowFromDrop>[0]>);
		columnsElement.addEventListener('windowdrop', handler);
		return () => columnsElement.removeEventListener('windowdrop', handler);
	});
</script>

<svelte:head>
	<title>Deployable Knowledge</title>
</svelte:head>

<main class="workspace" aria-label="Deployable Knowledge workspace">
	<section
		class="columns"
		bind:this={columnsElement}
		use:windowDragLayout
		use:columnSplitter
		aria-label="Window columns"
	>
		<div
			id="col-left"
			class="col"
			data-window-column={columns[0].id}
			data-split-pane="left"
			aria-label={columns[0].label}
		>
			{#each windowsFor(columns[0].id) as window (window.id)}
				{@const WindowComponent = window.component}
				<WindowComponent
					id={window.id}
					title={window.title}
					closable
					collapsed={window.collapsed}
					onToggleCollapse={() => toggleWindowCollapsed(window.id)}
					onClose={() => closeWindow(window.id)}
				/>
			{/each}
		</div>

		<div
			id="splitter"
			class="splitter"
			data-splitter
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize columns"
		></div>

		<div
			id="col-right"
			class="col"
			data-window-column={columns[1].id}
			data-split-pane="right"
			aria-label={columns[1].label}
		>
			{#each windowsFor(columns[1].id) as window (window.id)}
				{@const WindowComponent = window.component}
				<WindowComponent
					id={window.id}
					title={window.title}
					closable
					collapsed={window.collapsed}
					onToggleCollapse={() => toggleWindowCollapsed(window.id)}
					onClose={() => closeWindow(window.id)}
				/>
			{/each}
		</div>
	</section>
</main>

<style>
	.workspace {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--bg);
	}

	.columns {
		position: relative;
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
	}

	.col {
		position: relative;
		min-width: 220px;
		padding: 0px;
		overflow: auto;
		border-right: 1px solid var(--border);
		flex: 1 1 50%;
	}

	.col:last-child {
		border-right: 0;
	}

	.splitter {
		position: relative;
		width: 10px;
		border-right: 1px solid var(--border);
		border-left: 1px solid var(--border);
		background: linear-gradient(
			180deg,
			hsl(var(--h) var(--sat) calc(var(--l-bg) + 3%)),
			hsl(var(--h) var(--sat) calc(var(--l-bg) + 1%))
		);
		cursor: col-resize;
		flex: 0 0 10px;
		transition:
			background 150ms ease,
			box-shadow 150ms ease;
	}

	.splitter::after {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 3px;
		height: 36px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.08);
		box-shadow:
			0 -10px 0 0 rgba(255, 255, 255, 0.06),
			0 10px 0 0 rgba(255, 255, 255, 0.06);
		content: '';
		transform: translate(-50%, -50%);
	}

	.splitter:hover {
		background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 2%));
	}

	:global(.splitter.dragging) {
		background: hsl(var(--h) var(--sat) calc(var(--l-bg) + 1%));
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--accent) 30%, transparent) inset;
	}

	:global(.columns.dragging .col) {
		transition:
			background 120ms ease,
			outline-color 120ms ease;
	}

	:global(.columns.dragging .col.drop-candidate) {
		background: color-mix(in oklab, var(--accent) 7%, transparent);
		outline: 2px dashed color-mix(in oklab, var(--accent) 60%, transparent);
		outline-offset: -6px;
	}

	:global(.drop-marker) {
		height: 4px;
		margin: 8px 8px;
		border-radius: 2px;
		background: color-mix(in oklab, var(--accent) 60%, transparent);
	}

	@media (max-width: 720px) {
		.columns {
			flex-direction: column;
		}

		.col {
			min-width: 0;
			min-height: 180px;
		}

		.splitter {
			width: auto;
			height: 10px;
			cursor: row-resize;
			flex-basis: 10px;
		}

		.splitter::after {
			width: 44px;
			height: 3px;
		}
	}
</style>
