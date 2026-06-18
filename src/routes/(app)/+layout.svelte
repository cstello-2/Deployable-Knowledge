<script lang="ts">
  import "../../app.css";
  import { setContext } from "svelte";
  import "material-symbols/rounded.css";
  import AppHeader from "$lib/components/layout/AppHeader.svelte";
  import favicon from "$lib/assets/icon.svg";
  import { initWorkspaceStateStorage } from "$lib/utils/workspaceState";
  import { createAppState } from "$lib/state.svelte";

  let { children, data } = $props();
  const appState = createAppState();
  setContext("appState", appState);

  $effect(() => {
    appState.applySettings(data.settings);
  });

  initWorkspaceStateStorage();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="app-shell">
  <AppHeader />
  <div class="app-content">
    {@render children()}
  </div>
</div>

<style>
  .app-shell {
    display: flex;
    height: 100vh;
    min-height: 0;
    background: var(--bg);
    flex-direction: column;
  }

  .app-content {
    min-height: 0;
    flex: 1 1 auto;
  }
</style>
