export interface TranscriptionSegment {
	endMs: number;
	startMs: number;
	text: string;
}

export interface TranscriptionResult {
	fileName: string;
	segments: TranscriptionSegment[];
	text: string;
}

export interface ApiTranscriptionPathRequest {
	path: string;
}
