import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readDocxPageGeometry, type DocxPageGeometry } from "./docx-page-geometry";
import { runCommand } from "./pandoc-tectonic";

async function runConversion(
  absoluteDocxPath: string,
  workDir: string,
  geometry: DocxPageGeometry,
): Promise<void> {
  const texPath = join(workDir, "document.tex");

  // LaTeX's fontsize option only offers 10/11/12pt, too coarse for a docx's actual
  // (often fractional) body size, so the class size is just the baseline and running
  // text gets overridden to the precise value via a raw \fontsize command below.
  const lineHeightPt = geometry.bodyFontSizePt * geometry.lineSpacingMultiplier;
  const bodyFontPath = join(workDir, "body-font.tex");
  await writeFile(
    bodyFontPath,
    `\\fontsize{${geometry.bodyFontSizePt.toFixed(2)}pt}{${lineHeightPt.toFixed(2)}pt}\\selectfont\n`,
  );

  // LaTeX's list/quote/heading spacing is more generous than Word's, so those are
  // tightened unconditionally, but \parskip uses the docx's real weighted spacing since
  // Word paragraphs routinely rely on real "space after" instead of zero.

  // Bold/italic needs no handling here - pandoc's docx reader already maps w:b/w:i onto
  // \textbf/\emph when it produces the .tex below.
  const spacingHeaderPath = join(workDir, "spacing.tex");
  await writeFile(
    spacingHeaderPath,
    [
      // This PDF only exists to be text-extracted, so LaTeX's automatic hyphenation is
      // actively harmful: it breaks words across line-wraps ("Tacti-\ncal") and pdf-parse
      // captures that literally. Disabling it trades ragged lines for uncorrupted text.
      "\\usepackage[none]{hyphenat}",
      "\\sloppy",
      // Same reasoning for the footer page number - it's real rendered content pdf-parse
      // can't tell apart from body text. \pagestyle only affects what's drawn, not where
      // pages actually break, so real page counts are unaffected.
      "\\pagestyle{empty}",
      "\\usepackage{enumitem}",
      "\\setlist{nosep}",
      `\\setlength{\\parskip}{${geometry.paragraphAfterPt.toFixed(2)}pt}`,
      "\\setlength{\\topsep}{0pt}",
      "\\setlength{\\partopsep}{0pt}",
      "\\setlength{\\itemsep}{0pt}",
      "\\setlength{\\parsep}{0pt}",
      "\\usepackage{titlesec}",
      "\\titlespacing*{\\section}{0pt}{1ex}{0.5ex}",
      "\\titlespacing*{\\subsection}{0pt}{0.8ex}{0.4ex}",
      "\\titlespacing*{\\subsubsection}{0pt}{0.6ex}{0.3ex}",
      // Negative after-spacing keeps \paragraph/\subparagraph on their own line -
      // positive would run the heading inline with the text that follows it, which is
      // titlesec's default for these two levels but not how Word renders Heading4/5.
      "\\titlespacing*{\\paragraph}{0pt}{0.5ex}{-1em}",
      "\\titlespacing*{\\subparagraph}{0pt}{0.4ex}{-1em}",
      "",
    ].join("\n"),
  );

  const pandocArgs = [
    absoluteDocxPath,
    "--standalone",
    "-o",
    texPath,
    `--extract-media=${join(workDir, "media")}`,
    `--include-before-body=${bodyFontPath}`,
    `--include-in-header=${spacingHeaderPath}`,
    // Pandoc's default template renders at a fixed 10pt on full US Letter regardless of
    // the source's real page size/margins/font - match the docx's own values instead.
    "-V",
    `fontsize=${geometry.classFontSizePt}pt`,
    "-V",
    `geometry:paperwidth=${geometry.paperWidthIn.toFixed(3)}in`,
    "-V",
    `geometry:paperheight=${geometry.paperHeightIn.toFixed(3)}in`,
    "-V",
    `geometry:top=${geometry.marginTopIn.toFixed(3)}in`,
    "-V",
    `geometry:right=${geometry.marginRightIn.toFixed(3)}in`,
    "-V",
    `geometry:bottom=${geometry.marginBottomIn.toFixed(3)}in`,
    "-V",
    `geometry:left=${geometry.marginLeftIn.toFixed(3)}in`,
  ];

  await runCommand("pandoc", pandocArgs, workDir);
  await runCommand("tectonic", [texPath, "--outdir", workDir], workDir);
}

// pandoc converts the docx into standalone LaTeX, then tectonic typesets that into the
// final PDF. Page breaks land wherever LaTeX's layout puts them, not Word's - matching
// Word's own page count was tried and dropped (see git history for why).
export async function convertDocxToPdf(docxPath: string, pdfPath: string): Promise<void> {
  // Commands run with cwd set to workDir, so a relative docxPath (as callers pass) must
  // be resolved against the real cwd here first, before it means something different.
  const absoluteDocxPath = resolve(docxPath);
  const workDir = await mkdtemp(join(tmpdir(), "docx-to-pdf-"));

  try {
    const geometry = readDocxPageGeometry(absoluteDocxPath);
    await runConversion(absoluteDocxPath, workDir, geometry);
    await copyFile(join(workDir, "document.pdf"), pdfPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
