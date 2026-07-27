<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { DialogConfirmation } from '$lib/components/app/dialogs';
	import { WorkspaceWindow } from '$lib/components/app/workspace/WorkspaceWindow';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { chatStore, sessionsStore } from '$lib/stores';
	import type { Session } from '$lib/types';
	import ChatHistoryItem from './ChatHistoryItem.svelte';

	interface Props {
		collapsed?: boolean;
		closable?: boolean;
		height?: number | null;
		id: string;
		onClose?: () => void;
		onToggleCollapse?: () => void;
		title: string;
	}

	let {
		id,
		title,
		closable = false,
		height = null,
		collapsed = false,
		onToggleCollapse = () => {},
		onClose = () => {}
	}: Props = $props();

	let pendingDelete = $state<Session | null>(null);
	let pendingRename = $state<Session | null>(null);
	let renameTitle = $state('');

	onMount(() => void sessionsStore.refresh());

	async function select(session: Session): Promise<void> {
		chatStore.session = session;
		try {
			await chatStore.loadMessages();
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function rename(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!pendingRename || !renameTitle.trim()) return;
		try {
			await sessionsStore.rename(pendingRename.id, renameTitle.trim());
			if (chatStore.session?.id === pendingRename.id) {
				chatStore.session = sessionsStore.sessions.find(({ id }) => id === pendingRename?.id);
			}
			pendingRename = null;
			toast.success('Chat renamed');
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function remove(): Promise<void> {
		if (!pendingDelete) return;
		try {
			await sessionsStore.delete(pendingDelete.id);
			if (chatStore.session?.id === pendingDelete.id) {
				chatStore.session = sessionsStore.sessions[0];
				await chatStore.loadMessages();
			}
			pendingDelete = null;
			toast.success('Chat deleted');
		} catch (error) {
			toast.error(message(error));
		}
	}

	function message(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<WorkspaceWindow
	{id}
	{title}
	{closable}
	{height}
	{collapsed}
	{onToggleCollapse}
	{onClose}
	contentLabel="Chat history"
>
	<div class="grid content-start gap-2">
		{#each sessionsStore.sessions as session (session.id)}
			<ChatHistoryItem
				{session}
				active={session.id === chatStore.session?.id}
				onSelect={() => void select(session)}
				onRename={() => {
					pendingRename = session;
					renameTitle = session.title || '';
				}}
				onDelete={() => (pendingDelete = session)}
			/>
		{:else}
			<p class="p-6 text-center text-sm text-muted-foreground">No chat history yet.</p>
		{/each}
	</div>
</WorkspaceWindow>

<Dialog.Root open={Boolean(pendingRename)} onOpenChange={(open) => !open && (pendingRename = null)}>
	<Dialog.Content>
		<form class="grid gap-4" onsubmit={rename}>
			<Dialog.Header
				><Dialog.Title>Rename chat</Dialog.Title><Dialog.Description
					>Choose a descriptive title for this conversation.</Dialog.Description
				></Dialog.Header
			>
			<Input bind:value={renameTitle} aria-label="Chat title" autofocus />
			<Dialog.Footer
				><Button variant="outline" onclick={() => (pendingRename = null)}>Cancel</Button><Button
					type="submit">Rename</Button
				></Dialog.Footer
			>
		</form>
	</Dialog.Content>
</Dialog.Root>

<DialogConfirmation
	open={Boolean(pendingDelete)}
	description={`Delete “${pendingDelete?.title || 'this chat'}”? This cannot be undone.`}
	confirmLabel="Delete chat"
	onOpenChange={(open) => !open && (pendingDelete = null)}
	onConfirm={remove}
/>
