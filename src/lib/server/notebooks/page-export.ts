import PDFDocument from 'pdfkit';

export interface NotebookExport {
	notebookTitle: string;
	pages: Array<{ pageTitle: string; content: string }>;
}

export function notebookMarkdown(notebook: NotebookExport): string {
	const pages = notebook.pages
		.map(
			({ pageTitle, content }) => `## ${pageTitle}${content.trim() ? `\n\n${content.trim()}` : ''}`
		)
		.join('\n\n---\n\n');
	return `# ${notebook.notebookTitle}\n${pages ? `\n${pages}\n` : ''}`;
}

export function notebookExportFilename(title: string, extension: 'md' | 'pdf'): string {
	const safeTitle = title
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
	return `${safeTitle || 'notebook'}.${extension}`;
}

export async function notebookPdf(notebook: NotebookExport): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const document = new PDFDocument({
			size: 'LETTER',
			margins: { top: 54, right: 54, bottom: 58, left: 54 },
			bufferPages: true,
			info: { Title: notebook.notebookTitle, Creator: 'Deployable Knowledge' }
		});
		const chunks: Buffer[] = [];
		document.on('data', (chunk: Buffer) => chunks.push(chunk));
		document.on('error', reject);
		document.on('end', () => resolve(Buffer.concat(chunks)));

		const pages = notebook.pages.length
			? notebook.pages
			: [{ pageTitle: 'Notebook', content: 'This notebook is empty.' }];
		pages.forEach((page, index) => {
			if (index) document.addPage();
			document.font('Helvetica-Bold').fontSize(22).fillColor('#111827').text(page.pageTitle);
			document
				.moveDown(0.35)
				.font('Helvetica')
				.fontSize(10)
				.fillColor('#64748b')
				.text(notebook.notebookTitle);
			document
				.moveDown(0.75)
				.strokeColor('#cbd5e1')
				.moveTo(document.page.margins.left, document.y)
				.lineTo(document.page.width - document.page.margins.right, document.y)
				.stroke()
				.moveDown();
			document
				.font('Helvetica')
				.fontSize(11)
				.fillColor('#111827')
				.text(page.content.trim() || 'This page is empty.', { lineGap: 3 });
		});

		const range = document.bufferedPageRange();
		for (let index = range.start; index < range.start + range.count; index += 1) {
			document.switchToPage(index);
			document
				.font('Helvetica')
				.fontSize(9)
				.fillColor('#64748b')
				.text(`${index - range.start + 1} of ${range.count}`, 54, document.page.height - 38, {
					width: document.page.width - 108,
					align: 'center',
					lineBreak: false
				});
		}
		document.end();
	});
}
