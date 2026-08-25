import { API_DIAGNOSTICS } from '$lib/constants';
import type { ApiDiagnosticEventsResponse, ApiDiagnosticsSnapshot } from '$lib/types';
import { apiDownload, apiFetch } from '$lib/utils';

export class DiagnosticsService {
	static getSnapshot() {
		return apiFetch<ApiDiagnosticsSnapshot>(API_DIAGNOSTICS.BASE);
	}

	static getEvents(afterSequence: number) {
		const query = new URLSearchParams({ after: String(afterSequence) });
		return apiFetch<ApiDiagnosticEventsResponse>(`${API_DIAGNOSTICS.EVENTS}?${query}`);
	}

	static downloadReport() {
		return apiDownload(API_DIAGNOSTICS.REPORT, 'deployable-knowledge-diagnostics.txt');
	}
}
