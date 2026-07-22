<script lang="ts">
	import { WorkspaceColumns, WorkspaceTabs } from '$lib/components/app/workspace';
</script>

<svelte:head>
	<title>Deployable Knowledge</title>
</svelte:head>

<main
	class="flex h-full min-h-0 flex-col bg-background"
	aria-label="Deployable Knowledge workspace"
>
	<WorkspaceTabs />
	<div id="workspace-layout-panel" class="flex min-h-0 flex-1" role="tabpanel">
		<WorkspaceColumns />
	</div>
</main>
