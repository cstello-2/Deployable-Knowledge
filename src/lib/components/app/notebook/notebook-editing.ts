// Pure text transforms behind the notebook editor ribbon. Each command takes the
// current text plus selection and returns the next text with the selection to
// restore, so the component only moves the caret.

export interface EditorSelection {
	start: number;
	end: number;
}

export interface FormatResult {
	text: string;
	start: number;
	end: number;
}

export type InlineFormat = 'bold' | 'italic' | 'strikethrough' | 'code';
export type LineFormat = 'h1' | 'h2' | 'h3' | 'bullet-list' | 'ordered-list' | 'quote';
export type RibbonCommand =
	| InlineFormat
	| LineFormat
	| 'link'
	| 'code-block'
	| { color: string }
	| { highlight: string };

const INLINE_MARKERS: Record<InlineFormat, string> = {
	bold: '**',
	italic: '*',
	strikethrough: '~~',
	code: '`'
};

const HEADING_LEVELS: Record<'h1' | 'h2' | 'h3', number> = { h1: 1, h2: 2, h3: 3 };

export function toggleInline(
	text: string,
	{ start, end }: EditorSelection,
	format: InlineFormat
): FormatResult {
	const marker = INLINE_MARKERS[format];
	const selected = text.slice(start, end);
	const before = text.slice(0, start);
	const after = text.slice(end);

	if (before.endsWith(marker) && after.startsWith(marker)) {
		return {
			text: before.slice(0, -marker.length) + selected + after.slice(marker.length),
			start: start - marker.length,
			end: end - marker.length
		};
	}
	if (
		selected.length >= marker.length * 2 &&
		selected.startsWith(marker) &&
		selected.endsWith(marker)
	) {
		const inner = selected.slice(marker.length, selected.length - marker.length);
		return { text: before + inner + after, start, end: start + inner.length };
	}
	return {
		text: before + marker + selected + marker + after,
		start: start + marker.length,
		end: end + marker.length
	};
}

function lineBlock(text: string, { start, end }: EditorSelection) {
	const blockStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
	const terminator = text.indexOf('\n', Math.max(end, start));
	const blockEnd = terminator === -1 ? text.length : terminator;
	return { blockStart, blockEnd, lines: text.slice(blockStart, blockEnd).split('\n') };
}

function replaceBlock(
	text: string,
	blockStart: number,
	blockEnd: number,
	lines: string[]
): FormatResult {
	const block = lines.join('\n');
	return {
		text: text.slice(0, blockStart) + block + text.slice(blockEnd),
		start: blockStart,
		end: blockStart + block.length
	};
}

export function toggleLinePrefix(
	text: string,
	selection: EditorSelection,
	format: LineFormat
): FormatResult {
	const { blockStart, blockEnd, lines } = lineBlock(text, selection);
	const content = lines.filter((line) => line.trim());

	if (format === 'h1' || format === 'h2' || format === 'h3') {
		const prefix = `${'#'.repeat(HEADING_LEVELS[format])} `;
		const active = content.length > 0 && content.every((line) => line.startsWith(prefix));
		const next = lines.map((line) => {
			const stripped = line.replace(/^#{1,6}\s+/, '');
			return active || !stripped.trim() ? stripped : prefix + stripped;
		});
		return replaceBlock(text, blockStart, blockEnd, next);
	}

	if (format === 'bullet-list') {
		const active = content.length > 0 && content.every((line) => /^[-*+]\s/.test(line));
		const next = lines.map((line) => {
			const stripped = line.replace(/^[-*+]\s+/, '');
			return active || !stripped.trim() ? stripped : `- ${stripped}`;
		});
		return replaceBlock(text, blockStart, blockEnd, next);
	}

	if (format === 'ordered-list') {
		const active = content.length > 0 && content.every((line) => /^\d+\.\s/.test(line));
		let ordinal = 0;
		const next = lines.map((line) => {
			const stripped = line.replace(/^\d+\.\s+/, '');
			if (active || !stripped.trim()) return stripped;
			ordinal += 1;
			return `${ordinal}. ${stripped}`;
		});
		return replaceBlock(text, blockStart, blockEnd, next);
	}

	const active = content.length > 0 && content.every((line) => /^>\s?/.test(line));
	const next = lines.map((line) => {
		const stripped = line.replace(/^>\s?/, '');
		return active || !stripped.trim() ? stripped : `> ${stripped}`;
	});
	return replaceBlock(text, blockStart, blockEnd, next);
}

export function insertLink(text: string, { start, end }: EditorSelection): FormatResult {
	const selected = text.slice(start, end) || 'link text';
	const url = 'https://';
	const snippet = `[${selected}](${url})`;
	const urlStart = start + selected.length + 3;
	return {
		text: text.slice(0, start) + snippet + text.slice(end),
		start: urlStart,
		end: urlStart + url.length
	};
}

function wrapStyle(
	text: string,
	{ start, end }: EditorSelection,
	declaration: string,
	fallback: string
): FormatResult {
	const selected = text.slice(start, end) || fallback;
	const prefix = `<span style="${declaration}">`;
	const suffix = '</span>';
	return {
		text: text.slice(0, start) + prefix + selected + suffix + text.slice(end),
		start: start + prefix.length,
		end: start + prefix.length + selected.length
	};
}

export function wrapColor(text: string, selection: EditorSelection, color: string): FormatResult {
	return wrapStyle(text, selection, `color:${color}`, 'colored text');
}

export function wrapHighlight(
	text: string,
	selection: EditorSelection,
	color: string
): FormatResult {
	return wrapStyle(text, selection, `background-color:${color}`, 'highlighted text');
}

export function toggleCodeBlock(text: string, selection: EditorSelection): FormatResult {
	const { blockStart, blockEnd, lines } = lineBlock(text, selection);
	const fenced =
		lines.length >= 2 && lines[0].trim().startsWith('```') && lines.at(-1)?.trim() === '```';
	const next = fenced ? lines.slice(1, -1) : ['```', ...lines, '```'];
	return replaceBlock(text, blockStart, blockEnd, next);
}

export function applyRibbonCommand(
	text: string,
	selection: EditorSelection,
	command: RibbonCommand
): FormatResult {
	if (typeof command === 'object') {
		return 'highlight' in command
			? wrapHighlight(text, selection, command.highlight)
			: wrapColor(text, selection, command.color);
	}
	if (command === 'link') return insertLink(text, selection);
	if (command === 'code-block') return toggleCodeBlock(text, selection);
	if (command in INLINE_MARKERS) return toggleInline(text, selection, command as InlineFormat);
	return toggleLinePrefix(text, selection, command as LineFormat);
}
