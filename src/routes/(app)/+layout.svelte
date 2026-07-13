<script lang="ts">
  import "../../app.css";
  import { setContext } from "svelte";
  import "material-symbols/rounded.css";
  import AppHeader from "$lib/components/layout/AppHeader.svelte";
  import ToastHost from "$lib/components/utils/ToastHost.svelte";
  import favicon from "$lib/assets/icon.svg";
  import { initWorkspaceStateStorage } from "$lib/utils/workspaceState";
  import { AppState } from "$lib/state.svelte";

  let { children } = $props();
  const appState = new AppState();
  setContext("appState", appState);

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
  <ToastHost />
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
