<script lang="ts">
	import { tick } from 'svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Lock from '@lucide/svelte/icons/lock';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { ActionIcon } from '$lib/components/app/actions';
	import { WorkspaceToolbarActions, WorkspaceToolsMenu } from '$lib/components/app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { workspaceStore } from '$lib/stores';

	// Distance between tabs (gap-1) and how far a pointer travels before a click becomes a drag
	const TAB_GAP = 4;
	const DRAG_THRESHOLD = 4;

	type TabRect = { left: number; width: number };

	type TabDrag = {
		active: boolean;
		dx: number;
		index: number;
		maxDx: number;
		minDx: number;
		pointerId: number;
		presetId: string;
		rects: TabRect[];
		startX: number;
		targetIndex: number;
		width: number;
	};

	// After a drop the tab first lands at its release point in the new order without any
	// transition (pending), then animates the remaining distance into its slot
	type TabSettle = { dx: number; pending: boolean; presetId: string };

	let renamePresetId = $state<string | null>(null);
	let renameName = $state('');
	let tabElements = $state<(HTMLElement | undefined)[]>([]);
	let drag = $state<TabDrag | null>(null);
	let settle = $state<TabSettle | null>(null);
	let settleTimer = 0;
	let suppressNextClick = false;

	function renameLayout(event: SubmitEvent): void {
		event.preventDefault();
		if (!renamePresetId || !renameName.trim()) return;
		workspaceStore.renameLayoutPreset(renamePresetId, renameName);
		renamePresetId = null;
	}

	function handleTabPointerDown(event: PointerEvent, index: number, presetId: string): void {
		if (event.button !== 0) return;
		suppressNextClick = false;
		window.clearTimeout(settleTimer);
		settle = null;

		// offsetLeft ignores in-flight transforms, so a tab grabbed mid-settle still measures
		// its resting geometry
		const rects: TabRect[] = [];
		for (const element of tabElements.slice(0, workspaceStore.layoutPresets.length)) {
			if (!element) return;
			rects.push({ left: element.offsetLeft, width: element.offsetWidth });
		}

		const tab = rects[index];
		const last = rects[rects.length - 1];
		drag = {
			active: false,
			dx: 0,
			index,
			maxDx: last.left + last.width - tab.width - tab.left,
			minDx: rects[0].left - tab.left,
			pointerId: event.pointerId,
			presetId,
			rects,
			startX: event.clientX,
			targetIndex: index,
			width: tab.width
		};
	}

	function handleTabPointerMove(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId) return;

		const dx = event.clientX - drag.startX;
		if (!drag.active) {
			if (Math.abs(dx) < DRAG_THRESHOLD) return;
			// Capturing only once the drag starts keeps plain clicks targeting the tab buttons
			drag.active = true;
			suppressNextClick = true;
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}

		drag.dx = Math.min(Math.max(dx, drag.minDx), drag.maxDx);
		const center = drag.rects[drag.index].left + drag.dx + drag.width / 2;
		let targetIndex = 0;
		for (const [index, rect] of drag.rects.entries()) {
			if (index !== drag.index && center > rect.left + rect.width / 2) targetIndex += 1;
		}
		drag.targetIndex = targetIndex;
	}

	async function handleTabPointerEnd(event: PointerEvent, commit: boolean): Promise<void> {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const { active, dx, index, presetId, rects, targetIndex, width } = drag;

		// Without a reorder the tab just slides home; its static position never changes
		if (!commit || !active || targetIndex === index) {
			drag = null;
			return;
		}

		// Reordering moves every tab's static position in the same frame their shift transforms
		// clear, so transitions must be suppressed for that frame or the browser animates the
		// transform change from the wrong origin. The dragged tab then covers the remaining
		// distance from its release point to the slot.
		const target = rects[targetIndex];
		const slotLeft = targetIndex > index ? target.left + target.width - width : target.left;
		settle = { dx: rects[index].left + dx - slotLeft, pending: true, presetId };
		drag = null;
		workspaceStore.moveLayoutPreset(presetId, targetIndex);

		await tick();
		// Flush layout so the pending position is the transition's starting point
		tabElements[targetIndex]?.getBoundingClientRect();
		settle = { dx: 0, pending: false, presetId };
		window.clearTimeout(settleTimer);
		settleTimer = window.setTimeout(() => (settle = null), 200);
	}

	// Neighbours slide aside by the dragged tab's width to reveal the drop slot, browser style
	function tabShift(index: number): number {
		if (!drag?.active || index === drag.index) return 0;
		if (index > drag.index && index <= drag.targetIndex) return -(drag.width + TAB_GAP);
		if (index < drag.index && index >= drag.targetIndex) return drag.width + TAB_GAP;
		return 0;
	}

	function handleTabClick(presetId: string): void {
		if (suppressNextClick) {
			suppressNextClick = false;
			return;
		}
		workspaceStore.applyLayoutPreset(presetId);
	}
</script>

<nav
	aria-label="Workspace layouts"
	class="flex h-10 shrink-0 items-center border-b bg-elevated px-1 py-0.5"
>
	<div class="mr-1 flex shrink-0 items-center gap-1 border-r pr-1">
		<ActionIcon
			class="size-7 rounded-md"
			label={workspaceStore.leftPaneCollapsed ? 'Expand left column' : 'Collapse left column'}
			pressed={workspaceStore.leftPaneCollapsed}
			variant="outline"
			onclick={() => workspaceStore.toggleLeftPaneCollapsed()}
		>
			{#if workspaceStore.leftPaneCollapsed}<PanelLeftOpen />{:else}<PanelLeftClose />{/if}
		</ActionIcon>
		<WorkspaceToolsMenu />
	</div>
	<div
		class="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden"
		role="tablist"
	>
		{#each workspaceStore.layoutPresets as preset, index (preset.id)}
			{@const active = workspaceStore.activeLayoutPresetId === preset.id}
			{@const dragging = drag?.active === true && drag.presetId === preset.id}
			{@const settleDx = settle?.presetId === preset.id ? settle.dx : null}
			{@const shift = tabShift(index)}
			<ContextMenu.Root>
				<ContextMenu.Trigger>
					{#snippet child({ props })}
						<div
							{...props}
							bind:this={tabElements[index]}
							class={[
								'group flex h-8 max-w-56 min-w-36 touch-none items-center rounded-lg border transition-[background-color,border-color,color,box-shadow,transform] focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-inset',
								(dragging || settleDx !== null) && 'z-10 shadow-md',
								(dragging || settle?.pending) && 'transition-none',
								active
									? 'border-border bg-background text-foreground shadow-sm'
									: 'border-transparent bg-transparent text-muted-foreground hover:bg-card/75 hover:text-foreground'
							]}
							style:transform={dragging
								? `translateX(${drag?.dx ?? 0}px)`
								: settleDx !== null
									? `translateX(${settleDx}px)`
									: shift
										? `translateX(${shift}px)`
										: undefined}
							onpointercancel={(event) => handleTabPointerEnd(event, false)}
							onpointerdown={(event) => handleTabPointerDown(event, index, preset.id)}
							onpointermove={handleTabPointerMove}
							onpointerup={(event) => handleTabPointerEnd(event, true)}
						>
							<button
								aria-controls="workspace-layout-panel"
								aria-selected={active}
								class="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-left text-xs font-medium outline-none"
								role="tab"
								type="button"
								onclick={() => handleTabClick(preset.id)}
							>
								<LayoutDashboard class="size-3.5 shrink-0" />
								<span class="truncate">{preset.name}</span>
							</button>
							{#if workspaceStore.layoutPresets.length > 1}
								<ActionIcon
									class="mr-1 size-6 shrink-0 rounded-full opacity-65 hover:opacity-100"
									label={`Close ${preset.name}`}
									size="icon-sm"
									variant="ghost"
									onclick={() => workspaceStore.deleteLayoutPreset(preset.id)}
								>
									<X />
								</ActionIcon>
							{/if}
						</div>
					{/snippet}
				</ContextMenu.Trigger>
				<ContextMenu.Content>
					<ContextMenu.Item
						onclick={() => {
							renamePresetId = preset.id;
							renameName = preset.name;
						}}
					>
						<Pencil />
						Rename layout
					</ContextMenu.Item>
					<ContextMenu.CheckboxItem
						checked={preset.snapshot.windowMovementLocked}
						onCheckedChange={(locked) => workspaceStore.setWindowMovementLocked(preset.id, locked)}
					>
						<Lock />
						Lock layout
					</ContextMenu.CheckboxItem>
				</ContextMenu.Content>
			</ContextMenu.Root>
		{/each}

		<ActionIcon
			class="ml-1 size-7 shrink-0 rounded-full"
			label="New layout"
			variant="ghost"
			onclick={() => workspaceStore.addLayoutPreset()}
		>
			<Plus />
		</ActionIcon>
	</div>
	<WorkspaceToolbarActions />
</nav>

<Dialog.Root
	open={Boolean(renamePresetId)}
	onOpenChange={(open) => !open && (renamePresetId = null)}
>
	<Dialog.Content>
		<form class="grid gap-4" onsubmit={renameLayout}>
			<Dialog.Header>
				<Dialog.Title>Rename layout</Dialog.Title>
				<Dialog.Description>Choose a name for this workspace layout.</Dialog.Description>
			</Dialog.Header>
			<Input bind:value={renameName} aria-label="Layout name" autofocus maxlength={64} />
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (renamePresetId = null)}>
					Cancel
				</Button>
				<Button type="submit" disabled={!renameName.trim()}>Rename</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
