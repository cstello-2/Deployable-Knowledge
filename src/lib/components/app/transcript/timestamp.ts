export function formatTimestamp(milliseconds: number): string {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = String(totalSeconds % 60).padStart(2, '0');

	if (hours === 0) return `${minutes}:${seconds}`;

	return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
}
