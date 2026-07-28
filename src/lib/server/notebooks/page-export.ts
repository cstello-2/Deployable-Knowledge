import PDFDocument from "pdfkit";

type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "numbered"; number: string; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "rule" };

export type NotebookPageExport = {
  notebookTitle: string;
  pageTitle: string;
  content: string;
};

export type NotebookExport = {
  notebookTitle: string;
  pages: Array<Pick<NotebookPageExport, "pageTitle" | "content">>;
};

export function notebookPageMarkdown(page: NotebookPageExport): string {
  const body = page.content.trim();
  return `# ${page.pageTitle}${body ? `\n\n${body}` : ""}\n`;
}

export function notebookMarkdown(notebook: NotebookExport): string {
  const pages = notebook.pages
    .map((page) => {
      const body = page.content.trim();
      return `## ${page.pageTitle}${body ? `\n\n${body}` : ""}`;
    })
    .join("\n\n---\n\n");

  return `# ${notebook.notebookTitle}\n${pages ? `\n${pages}\n` : ""}`;
}

export function notebookPageExportFilename(
  pageTitle: string,
  extension: "md" | "pdf",
): string {
  const safeTitle = pageTitle
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${safeTitle || "notebook-page"}.${extension}`;
}

export async function notebookPagePdf(
  page: NotebookPageExport,
): Promise<Buffer> {
  return notebookPdf({
    notebookTitle: page.notebookTitle,
    pages: [{ pageTitle: page.pageTitle, content: page.content }],
  });
}

export async function notebookPdf(notebook: NotebookExport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, right: 54, bottom: 58, left: 54 },
      bufferPages: true,
      info: {
        Title: notebook.notebookTitle,
        Subject: `${notebook.pages.length} notebook page${
          notebook.pages.length === 1 ? "" : "s"
        } exported from Deployable Knowledge`,
        Creator: "Deployable Knowledge",
      },
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    notebook.pages.forEach((page, pageIndex) => {
      if (pageIndex > 0) doc.addPage();
      writeNotebookPage(doc, notebook.notebookTitle, page);
    });

    if (notebook.pages.length === 0) {
      writeNotebookPage(doc, notebook.notebookTitle, {
        pageTitle: "Notebook",
        content: "",
      });
    }

    writePageNumbers(doc);

    doc.end();
  });
}

function writeNotebookPage(
  doc: PDFKit.PDFDocument,
  notebookTitle: string,
  page: Pick<NotebookPageExport, "pageTitle" | "content">,
) {
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(page.pageTitle, { lineGap: 3 });
  doc
    .moveDown(0.35)
    .fillColor("#64748b")
    .font("Helvetica")
    .fontSize(10)
    .text(notebookTitle);
  doc
    .moveDown(0.75)
    .strokeColor("#cbd5e1")
    .lineWidth(0.75)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke()
    .moveDown(1);

  const blocks = parseMarkdownBlocks(page.content);
  if (blocks.length === 0) {
    doc
      .fillColor("#64748b")
      .font("Helvetica-Oblique")
      .fontSize(11)
      .text("This page is empty.");
    return;
  }

  for (const block of blocks) writeBlock(doc, block);
}

function writePageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor("#64748b")
      .font("Helvetica")
      .fontSize(9)
      .text(
        `${index - range.start + 1} of ${range.count}`,
        doc.page.margins.left,
        doc.page.height - 38,
        {
          width:
            doc.page.width -
            doc.page.margins.left -
            doc.page.margins.right,
          align: "center",
          lineBreak: false,
        },
      );
    doc.page.margins.bottom = bottomMargin;
  }
}

function writeBlock(doc: PDFKit.PDFDocument, block: MarkdownBlock) {
  const contentWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  if (block.kind === "rule") {
    doc
      .moveDown(0.4)
      .strokeColor("#cbd5e1")
      .lineWidth(0.6)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke()
      .moveDown(0.8);
    return;
  }

  if (block.kind === "heading") {
    const sizes = [18, 16, 14, 12, 11, 11];
    doc
      .moveDown(block.level === 1 ? 0.8 : 0.55)
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .fontSize(sizes[block.level - 1] ?? 11)
      .text(cleanInlineMarkdown(block.text), { lineGap: 2 })
      .moveDown(0.3);
    return;
  }

  if (block.kind === "code") {
    doc
      .moveDown(0.2)
      .fillColor("#1f2937")
      .font("Courier")
      .fontSize(9)
      .text(block.text, {
        indent: 10,
        width: contentWidth - 20,
        lineGap: 2,
      })
      .moveDown(0.65);
    return;
  }

  if (block.kind === "quote") {
    doc
      .fillColor("#475569")
      .font("Helvetica-Oblique")
      .fontSize(11)
      .text(cleanInlineMarkdown(block.text), {
        indent: 14,
        width: contentWidth - 14,
        lineGap: 3,
      })
      .moveDown(0.65);
    return;
  }

  if (block.kind === "bullet" || block.kind === "numbered") {
    const marker = block.kind === "bullet" ? "-" : `${block.number}.`;
    doc
      .fillColor("#111827")
      .font("Helvetica")
      .fontSize(11)
      .text(`${marker}  ${cleanInlineMarkdown(block.text)}`, {
        indent: 10,
        width: contentWidth - 10,
        lineGap: 3,
      })
      .moveDown(0.25);
    return;
  }

  doc
    .fillColor("#111827")
    .font("Helvetica")
    .fontSize(11)
    .text(cleanInlineMarkdown(block.text), { lineGap: 3 })
    .moveDown(0.65);
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };

  const flushCode = () => {
    if (code === null) return;
    blocks.push({ kind: "code", text: code.join("\n") });
    code = null;
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph();
      if (code === null) code = [];
      else flushCode();
      continue;
    }

    if (code !== null) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    const quote = line.match(/^\s*>\s?(.+)$/);

    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
      });
    } else if (bullet) {
      flushParagraph();
      blocks.push({ kind: "bullet", text: bullet[1] });
    } else if (numbered) {
      flushParagraph();
      blocks.push({
        kind: "numbered",
        number: numbered[1],
        text: numbered[2],
      });
    } else if (quote) {
      flushParagraph();
      blocks.push({ kind: "quote", text: quote[1] });
    } else if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
    } else {
      paragraph.push(line.trim());
    }
  }

  flushParagraph();
  flushCode();
  return blocks;
}

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/([*_~])([^*_~]+)\1/g, "$2");
}
