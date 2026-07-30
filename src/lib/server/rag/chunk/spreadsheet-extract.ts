import type { ExtractedChunk, ExtractionResult, Source } from './parse-shared';
import { rowsToTablePages } from './tabular-extract';

const MAX_SPREADSHEET_CELLS = 200_000;

export async function extractSpreadsheet(
	source: Source,
	onProgress?: (ratio: number, message: string) => void
): Promise<ExtractionResult> {
	const { default: excel } = await import('exceljs');
	const workbook = new excel.Workbook();
	await workbook.xlsx.readFile(source.path);

	const worksheets = workbook.worksheets;
	const chunks: ExtractedChunk[] = [];
	let cellCount = 0;

	worksheets.forEach((worksheet, sheetIndex) => {
		onProgress?.(
			(sheetIndex + 1) / Math.max(worksheets.length, 1),
			`Reading sheet ${sheetIndex + 1} of ${worksheets.length}`
		);

		const rows: string[][] = [];
		worksheet.eachRow((row) => {
			const cells: string[] = [];
			row.eachCell({ includeEmpty: true }, (cell) => {
				cells.push(cell.text ?? '');
			});
			cellCount += cells.length;
			if (cellCount > MAX_SPREADSHEET_CELLS) {
				throw new Error(
					`This spreadsheet has more than ${MAX_SPREADSHEET_CELLS.toLocaleString('en-US')} cells and cannot be ingested.`
				);
			}
			rows.push(cells);
		});

		chunks.push(...rowsToTablePages(source, rows, sheetIndex, worksheet.name));
	});

	return { chunks, pageCount: worksheets.length };
}
