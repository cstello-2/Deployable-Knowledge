<script lang="ts">
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

	let renamePresetId = $state<string | null>(null);
	let renameName = $state('');

	function renameLayout(event: SubmitEvent): void {
		event.preventDefault();
		if (!renamePresetId || !renameName.trim()) return;
		workspaceStore.renameLayoutPreset(renamePresetId, renameName);
		renamePresetId = null;
	}
</script>

<nav
	class="flex h-10 shrink-0 items-center border-b bg-elevated px-1 py-0.5"
	aria-label="Workspace layouts"
>
	<div class="mr-1 flex shrink-0 items-center gap-1 border-r pr-1">
		<ActionIcon
			class="size-7 rounded-md"
			label={workspaceStore.leftPaneCollapsed ? 'Expand left column' : 'Collapse left column'}
			onclick={() => workspaceStore.toggleLeftPaneCollapsed()}
			pressed={workspaceStore.leftPaneCollapsed}
			variant="outline"
		>
			{#if workspaceStore.leftPaneCollapsed}<PanelLeftOpen />{:else}<PanelLeftClose />{/if}
		</ActionIcon>
		<WorkspaceToolsMenu />
	</div>
	<div
		class="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden"
		role="tablist"
	>
		{#each workspaceStore.layoutPresets as preset (preset.id)}
			{@const active = workspaceStore.activeLayoutPresetId === preset.id}
			<ContextMenu.Root>
				<ContextMenu.Trigger>
					{#snippet child({ props })}
						<div
							{...props}
							class={[
								'group flex h-8 min-w-36 max-w-56 items-center rounded-lg border transition-[background-color,border-color,color,box-shadow] focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-inset',
								active
									? 'border-border bg-background text-foreground shadow-sm'
									: 'border-transparent bg-transparent text-muted-foreground hover:bg-card/75 hover:text-foreground'
							]}
						>
							<button
								class="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-left text-xs font-medium outline-none"
								type="button"
								role="tab"
								aria-selected={active}
								aria-controls="workspace-layout-panel"
								onclick={() => workspaceStore.applyLayoutPreset(preset.id)}
							>
								<LayoutDashboard class="size-3.5 shrink-0" />
								<span class="truncate">{preset.name}</span>
							</button>
							{#if workspaceStore.layoutPresets.length > 1}
								<ActionIcon
									variant="ghost"
									size="icon-sm"
									class="mr-1 size-6 shrink-0 rounded-full opacity-65 hover:opacity-100"
									label={`Close ${preset.name}`}
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
			variant="ghost"
			class="ml-1 size-7 shrink-0 rounded-full"
			label="New layout"
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
			<Input bind:value={renameName} maxlength={64} aria-label="Layout name" autofocus />
			<Dialog.Footer>
				<Button variant="outline" type="button" onclick={() => (renamePresetId = null)}>
					Cancel
				</Button>
				<Button type="submit" disabled={!renameName.trim()}>Rename</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
