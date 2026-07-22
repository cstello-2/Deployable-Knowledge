<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Save from '@lucide/svelte/icons/save';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { ActionIcon } from '$lib/components/app/actions';
	import { DialogConfirmation } from '$lib/components/app/dialogs';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { settingsStore } from '$lib/stores';
	import { profileDisplayName } from './settings-profiles';

	let createOpen = $state(false);
	let newName = $state('');
	let confirmDelete = $state(false);

	async function activate(id: string): Promise<void> {
		if (!id) return;
		try {
			await settingsStore.activateProfile(id);
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function create(): Promise<void> {
		if (!newName.trim()) return;
		try {
			await settingsStore.createProfile(newName.trim());
			newName = '';
			createOpen = false;
			toast.success('Profile created');
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function save(): Promise<void> {
		try {
			await settingsStore.saveProfile();
			toast.success('Profile saved');
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function remove(): Promise<void> {
		const id = settingsStore.activeProfileId;
		if (!id) return;
		try {
			await settingsStore.deleteProfile(id);
			toast.success('Profile deleted');
		} catch (error) {
			toast.error(message(error));
		}
	}

	function message(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<section class="grid gap-2">
	<Label for="settings-profile">Profile</Label>
	<div class="flex gap-2">
		<Select.Root
			type="single"
			value={settingsStore.activeProfileId ?? ''}
			onValueChange={(id) => void activate(id)}
		>
			<Select.Trigger id="settings-profile" class="min-w-0 flex-1">
				<span class="truncate"
					>{settingsStore.activeProfile
						? profileDisplayName(settingsStore.activeProfile)
						: 'Select a profile'}</span
				>
			</Select.Trigger>
			<Select.Content>
				{#each settingsStore.profiles as profile (profile.id)}
					<Select.Item value={profile.id} label={profileDisplayName(profile)} />
				{/each}
			</Select.Content>
		</Select.Root>
		<ActionIcon
			variant="outline"
			label="Save profile"
			disabled={!settingsStore.activeProfileId}
			onclick={save}><Save /></ActionIcon
		>
		<ActionIcon
			variant="outline"
			label="Delete profile"
			disabled={!settingsStore.activeProfileId}
			onclick={() => (confirmDelete = true)}><Trash2 /></ActionIcon
		>
		<ActionIcon variant="outline" label="New profile" onclick={() => (createOpen = true)}
			><Plus /></ActionIcon
		>
	</div>
</section>

<Dialog.Root
	open={createOpen}
	onOpenChange={(open) => {
		createOpen = open;
		if (!open) newName = '';
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<form
			class="grid gap-4"
			onsubmit={(event) => {
				event.preventDefault();
				void create();
			}}
		>
			<Dialog.Header>
				<Dialog.Title>New profile</Dialog.Title>
				<Dialog.Description>
					Create a profile from the assistant settings currently shown.
				</Dialog.Description>
			</Dialog.Header>
			<div class="grid gap-2">
				<Label for="new-profile-name">Profile name</Label>
				<Input id="new-profile-name" bind:value={newName} autofocus required />
			</div>
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (createOpen = false)}>Cancel</Button>
				<Button disabled={!newName.trim()} type="submit">Create profile</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<DialogConfirmation
	open={confirmDelete}
	description={`Delete “${settingsStore.activeProfile?.name ?? 'this profile'}”?`}
	confirmLabel="Delete profile"
	onOpenChange={(open) => (confirmDelete = open)}
	onConfirm={remove}
/>
