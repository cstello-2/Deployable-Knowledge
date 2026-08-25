import { browser } from '$app/environment';
import { DiagnosticsService } from '$lib/services';
import type { ApiDiagnosticsSnapshot, DiagnosticEvent } from '$lib/types';

const CLIENT_EVENT_LIMIT = 500;
const EVENT_POLL_INTERVAL_MS = 2_000;
const SNAPSHOT_REFRESH_INTERVAL_MS = 15_000;

class DiagnosticsStore {
	private eventTimer: number | null = null;
	private latestSequence = 0;
	private listeners = 0;
	private polling = false;
	private snapshotTimer: number | null = null;

	error = $state<string | null>(null);
	events = $state<DiagnosticEvent[]>([]);
	loading = $state(false);
	paused = $state(false);
	snapshot = $state<ApiDiagnosticsSnapshot | null>(null);

	start(): void {
		if (!browser) return;
		this.listeners += 1;
		if (this.listeners > 1) return;

		void this.refresh();
		this.eventTimer = window.setInterval(() => this.pollEvents(), EVENT_POLL_INTERVAL_MS);
		this.snapshotTimer = window.setInterval(
			() => this.pollSnapshot(),
			SNAPSHOT_REFRESH_INTERVAL_MS
		);
	}

	stop(): void {
		this.listeners = Math.max(0, this.listeners - 1);
		if (this.listeners > 0) return;

		if (this.eventTimer !== null) window.clearInterval(this.eventTimer);
		if (this.snapshotTimer !== null) window.clearInterval(this.snapshotTimer);
		this.eventTimer = null;
		this.snapshotTimer = null;
	}

	setPaused(paused: boolean): void {
		if (paused === this.paused) return;
		this.paused = paused;
		if (!paused) this.pollEvents();
	}

	async refresh(): Promise<void> {
		if (this.loading) return;
		this.loading = true;
		this.error = null;
		try {
			await Promise.all([this.refreshSnapshot(), this.refreshEvents()]);
		} catch (error) {
			this.error = message(error, 'Diagnostics could not be loaded.');
		} finally {
			this.loading = false;
		}
	}

	private pollEvents(): void {
		void this.refreshEvents().catch((error) => {
			this.error = message(error, 'Diagnostic event polling failed.');
		});
	}

	private pollSnapshot(): void {
		void this.refreshSnapshot().catch((error) => {
			this.error = message(error, 'Diagnostic health check failed.');
		});
	}

	private async refreshSnapshot(): Promise<void> {
		this.snapshot = await DiagnosticsService.getSnapshot();
		this.error = null;
	}

	private async refreshEvents(): Promise<void> {
		if (this.paused || this.polling) return;
		this.polling = true;
		try {
			const response = await DiagnosticsService.getEvents(this.latestSequence);
			this.latestSequence = response.latestSequence;
			this.events = [...this.events, ...response.events].slice(-CLIENT_EVENT_LIMIT);
			this.error = null;
		} finally {
			this.polling = false;
		}
	}
}

function message(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export const diagnosticsStore = new DiagnosticsStore();
