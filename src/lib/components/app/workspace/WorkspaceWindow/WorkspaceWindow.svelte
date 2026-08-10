<script lang="ts">
	import { cn } from '$lib/components/ui/utils';
	import WorkspaceWindowTitlebar from './WorkspaceWindowTitlebar.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		class?: string;
		collapsed?: boolean;
		collapsible?: boolean;
		closable?: boolean;
		contentClass?: string;
		contentLabel?: string;
		headerActions?: Snippet;
		height?: number | null;
		id: string;
		modal?: boolean;
		onClose?: () => void;
		onToggleCollapse?: () => void;
		// Set false to let the window content run edge to edge
		padded?: boolean;
		title: string;
	}

	let {
		children,
		class: className,
		collapsed = false,
		collapsible = true,
		closable = false,
		contentClass,
		contentLabel,
		headerActions,
		height = null,
		id,
		modal = false,
		onClose = () => {},
		onToggleCollapse = () => {},
		padded = true,
		title
	}: Props = $props();

	const windowStyle = $derived(
		!collapsed && height && height > 0 ? `flex: 1 1 ${height}px;` : undefined
	);
</script>

<article
	class={cn(
		'miniwin workspace-window flex min-h-(--titlebar-height) max-h-full flex-1 flex-col overflow-hidden border outline-none focus-visible:ring-2 focus-visible:ring-ring',
		collapsed && 'collapsed flex-none',
		modal && 'modal',
		className
	)}
	data-window-id={id}
	data-window-modal={modal ? 'true' : undefined}
	style={windowStyle}
	tabindex="-1"
	aria-label={title}
>
	<WorkspaceWindowTitlebar
		{collapsed}
		{collapsible}
		{closable}
		{headerActions}
		{onClose}
		{onToggleCollapse}
		{title}
	/>
	<div
		class={cn(
			'grid min-h-0 flex-1 grid-rows-[1fr] opacity-100',
			padded && 'p-3.5',
			collapsed && 'min-h-0 flex-none grid-rows-[0fr] py-0 opacity-0'
		)}
		aria-label={contentLabel ?? `${title} content`}
		aria-hidden={collapsed}
	>
		<div class={cn('min-h-0 overflow-auto', contentClass)}>
			{@render children?.()}
		</div>
	</div>
</article>
