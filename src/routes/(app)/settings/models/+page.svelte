<script lang="ts">
	import {
		SettingsApiKeys,
		SettingsLocalModels,
		SettingsLocalRuntimeSection
	} from '$lib/components/app/settings';
</script>

<svelte:head>
	<title>Model settings · Deployable Knowledge</title>
</svelte:head>

<SettingsLocalModels />
<SettingsLocalRuntimeSection />
<SettingsApiKeys />
