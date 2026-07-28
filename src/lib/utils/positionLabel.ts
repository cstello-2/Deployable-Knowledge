// What pageIndex (0-based) means to a reader differs per format - this is the one place
// that mapping lives, so the server and every search UI stay in sync.
export function formatPositionLabel(sourceType: string, pageIndex: number, chunkIndex: number): string | null {
  switch (sourceType) {
    case "PDF":
      return `Page ${pageIndex + 1}`;
    case "PPTX":
      return `Slide ${pageIndex + 1}`;
    case "CSV":
    case "XLSX":
      return `Row ${pageIndex + 1}`;
    case "TXT":
    case "MD":
      return `Line ${pageIndex + 1}`;
    case "DOCX":
      // This is the LaTeX render's page, not Word's real page - it will disagree with
      // Word's own count. TODO: revisit before shipping - see chunkIndex-based "Chunk N".
      return `Page ${pageIndex + 1}`;
    default:
      return null;
  }
}
