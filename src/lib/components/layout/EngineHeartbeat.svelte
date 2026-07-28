<script lang="ts">
  import { onMount } from "svelte";

  type HeartbeatResponse = {
    status?: string;
    checkedAt?: string;
  };

  const POLL_INTERVAL_MS = 5_000;
  const REQUEST_TIMEOUT_MS = 3_000;

  let online = $state(false);
  let checked = $state(false);
  let lastCheckedAt = $state<string | null>(null);
  let checking = false;

  function statusTitle() {
    if (!checked) return "Checking engine connection";
    const checkedLabel = lastCheckedAt
      ? ` Last checked ${new Date(lastCheckedAt).toLocaleTimeString()}.`
      : "";
    return online
      ? `Engine is online.${checkedLabel}`
      : `Engine is offline.${checkedLabel}`;
  }

  async function checkHeartbeat() {
    if (checking) return;
    checking = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      if (!navigator.onLine) throw new Error("Browser is offline");
      const response = await fetch("/heartbeat", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const body = (await response.json()) as HeartbeatResponse;
      online = response.ok && body.status === "online";
      lastCheckedAt = body.checkedAt ?? new Date().toISOString();
    } catch {
      online = false;
      lastCheckedAt = new Date().toISOString();
    } finally {
      window.clearTimeout(timeout);
      checked = true;
      checking = false;
    }
  }

  onMount(() => {
    const handleOnline = () => void checkHeartbeat();
    const handleOffline = () => {
      online = false;
      checked = true;
      lastCheckedAt = new Date().toISOString();
    };

    void checkHeartbeat();
    const interval = window.setInterval(
      () => void checkHeartbeat(),
      POLL_INTERVAL_MS,
    );
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  });
</script>

<div
  class="engine-heartbeat"
  class:online
  class:offline={checked && !online}
  role="status"
  aria-live="polite"
  title={statusTitle()}
>
  <span class="heartbeat-dot" aria-hidden="true"></span>
  <span>{online ? "Engine online" : "Engine offline"}</span>
</div>

<style>
  .engine-heartbeat {
    display: inline-flex;
    min-height: 28px;
    padding: 4px 8px;
    border: 1px solid color-mix(in oklab, #ef4444 42%, var(--border));
    border-radius: 999px;
    background: color-mix(in oklab, #ef4444 8%, transparent);
    color: color-mix(in oklab, #ef4444 82%, var(--text));
    font-size: 11px;
    font-weight: 650;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .engine-heartbeat.online {
    border-color: color-mix(in oklab, #22c55e 42%, var(--border));
    background: color-mix(in oklab, #22c55e 8%, transparent);
    color: color-mix(in oklab, #22c55e 82%, var(--text));
  }

  .heartbeat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    box-shadow: 0 0 0 3px color-mix(in oklab, #ef4444 18%, transparent);
  }

  .online .heartbeat-dot {
    background: #22c55e;
    box-shadow: 0 0 0 3px color-mix(in oklab, #22c55e 18%, transparent);
  }

  @media (max-width: 560px) {
    .engine-heartbeat span:last-child {
      display: none;
    }

    .engine-heartbeat {
      width: 28px;
      padding: 4px;
      justify-content: center;
    }
  }
</style>
