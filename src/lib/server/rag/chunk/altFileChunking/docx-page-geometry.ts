import AdmZip from "adm-zip";

export type DocxPageGeometry = {
  paperWidthIn: number;
  paperHeightIn: number;
  marginTopIn: number;
  marginRightIn: number;
  marginBottomIn: number;
  marginLeftIn: number;
  bodyFontSizePt: number;
  classFontSizePt: 10 | 11 | 12;
  lineSpacingMultiplier: number;
  paragraphAfterPt: number;
};

const TWIPS_PER_INCH = 1440;
const TWIPS_PER_POINT = 20;
const HALF_POINTS_PER_POINT = 2;
const DEFAULT_DOC_DEFAULTS_HALF_POINTS = 22; // 11pt - Word's own fallback when unset

// This pipeline renders in LaTeX's default font (Latin Modern), not the docx's real font,
// so the docx's own line-spacing ratio (meaningful only relative to its real font) would
// be wrong here - use a fixed value tuned against Latin Modern instead.
const FIXED_LINE_SPACING_MULTIPLIER = 1.19;

const DEFAULT_GEOMETRY: DocxPageGeometry = {
  paperWidthIn: 8.5,
  paperHeightIn: 11,
  marginTopIn: 1,
  marginRightIn: 1,
  marginBottomIn: 1,
  marginLeftIn: 1,
  bodyFontSizePt: 11,
  classFontSizePt: 11,
  lineSpacingMultiplier: FIXED_LINE_SPACING_MULTIPLIER,
  paragraphAfterPt: 0,
};

function attr(tagAttributes: string, name: string): string | undefined {
  return tagAttributes.match(new RegExp(`w:${name}="(\\d+)"`))?.[1];
}

function nearestClassSize(pt: number): 10 | 11 | 12 {
  const options = [10, 11, 12] as const;
  return options.reduce((closest, candidate) =>
    Math.abs(candidate - pt) < Math.abs(closest - pt) ? candidate : closest,
  );
}

type StyleInfo = {
  sizeHalfPt?: number;
  afterTwips?: number;
  basedOn?: string;
};

function extractPPr(source: string): string {
  return source.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? "";
}

function extractAfterTwips(pPrBlock: string): number | undefined {
  const spacingTag = pPrBlock.match(/<w:spacing\s+([^>]*)\/>/)?.[1];
  if (!spacingTag) return undefined;
  const after = attr(spacingTag, "after");
  return after ? Number(after) : undefined;
}

// Paragraph styles inherit font size and spacing through a basedOn chain, falling all
// the way back to docDefaults if nothing in the chain sets an explicit value.
function resolveStyle<T>(
  styleId: string | undefined,
  styleMap: Map<string, StyleInfo>,
  pick: (style: StyleInfo) => T | undefined,
  fallback: T,
  depth = 0,
): T {
  if (!styleId || depth > 10) return fallback;
  const style = styleMap.get(styleId);
  if (!style) return fallback;
  const picked = pick(style);
  if (picked !== undefined) return picked;
  return resolveStyle(style.basedOn, styleMap, pick, fallback, depth + 1);
}

// A doc-wide default is a poor estimate of real density since templates define several
// paragraph styles - weighting each style's font size/spacing by how many characters
// actually use it approximates what really fills the page.
function estimateBodyMetrics(documentXml: string, stylesXml: string) {
  const styleMap = new Map<string, StyleInfo>();
  for (const match of stylesXml.matchAll(/<w:style\s[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const [, styleId, body] = match;
    const sizeMatch = body.match(/<w:sz w:val="(\d+)"/)?.[1];
    const basedOn = body.match(/<w:basedOn w:val="([^"]+)"/)?.[1];
    styleMap.set(styleId, {
      sizeHalfPt: sizeMatch ? Number(sizeMatch) : undefined,
      afterTwips: extractAfterTwips(extractPPr(body)),
      basedOn,
    });
  }

  const docDefaultsHalfPt = Number(
    stylesXml.match(/<w:docDefaults>[\s\S]*?<w:sz w:val="(\d+)"/)?.[1] ?? DEFAULT_DOC_DEFAULTS_HALF_POINTS,
  );
  const docDefaultsAfterTwips = extractAfterTwips(
    stylesXml.match(/<w:pPrDefault>[\s\S]*?<\/w:pPrDefault>/)?.[0] ?? "",
  );
  const docDefaultsAfterPt = docDefaultsAfterTwips
    ? docDefaultsAfterTwips / TWIPS_PER_POINT
    : DEFAULT_GEOMETRY.paragraphAfterPt;

  let totalChars = 0;
  let weightedHalfPt = 0;
  let weightedAfterPt = 0;

  for (const match of documentXml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const body = match[1];
    const styleId = body.match(/<w:pStyle w:val="([^"]+)"/)?.[1];
    const chars = [...body.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].reduce((sum, t) => sum + t[1].length, 0);
    if (chars === 0) continue;

    // Direct paragraph-level formatting overrides its style, same as in Word.
    const ownAfterTwips = extractAfterTwips(extractPPr(body));

    const sizeHalfPt = resolveStyle(styleId, styleMap, (s) => s.sizeHalfPt, docDefaultsHalfPt);
    const afterTwips =
      ownAfterTwips ?? resolveStyle(styleId, styleMap, (s) => s.afterTwips, docDefaultsAfterTwips) ?? 0;
    const afterPt = afterTwips / TWIPS_PER_POINT;

    totalChars += chars;
    weightedHalfPt += chars * sizeHalfPt;
    weightedAfterPt += chars * afterPt;
  }

  if (totalChars === 0) {
    return {
      bodyFontSizePt: docDefaultsHalfPt / HALF_POINTS_PER_POINT,
      paragraphAfterPt: docDefaultsAfterPt,
    };
  }

  return {
    bodyFontSizePt: weightedHalfPt / totalChars / HALF_POINTS_PER_POINT,
    paragraphAfterPt: weightedAfterPt / totalChars,
  };
}

// Page size, margins, and font/spacing are stored explicitly in the docx (document.xml's
// sectPr/pPr, styles.xml) - reading them lets pandoc/tectonic render close to the source's
// real density instead of LaTeX's own, much roomier defaults.
export function readDocxPageGeometry(docxPath: string): DocxPageGeometry {
  try {
    const zip = new AdmZip(docxPath);
    const documentXml = zip.readAsText("word/document.xml");
    const stylesXml = zip.readAsText("word/styles.xml");
    const lastSection = [...documentXml.matchAll(/<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/g)].at(-1)?.[0] ?? "";

    const pgSz = lastSection.match(/<w:pgSz\s+([^>]*)\/>/)?.[1] ?? "";
    const pgMar = lastSection.match(/<w:pgMar\s+([^>]*)\/>/)?.[1] ?? "";

    const widthTwips = attr(pgSz, "w");
    const heightTwips = attr(pgSz, "h");
    const topTwips = attr(pgMar, "top");
    const rightTwips = attr(pgMar, "right");
    const bottomTwips = attr(pgMar, "bottom");
    const leftTwips = attr(pgMar, "left");

    const { bodyFontSizePt, paragraphAfterPt } = estimateBodyMetrics(documentXml, stylesXml);

    return {
      paperWidthIn: widthTwips ? Number(widthTwips) / TWIPS_PER_INCH : DEFAULT_GEOMETRY.paperWidthIn,
      paperHeightIn: heightTwips ? Number(heightTwips) / TWIPS_PER_INCH : DEFAULT_GEOMETRY.paperHeightIn,
      marginTopIn: topTwips ? Number(topTwips) / TWIPS_PER_INCH : DEFAULT_GEOMETRY.marginTopIn,
      marginRightIn: rightTwips ? Number(rightTwips) / TWIPS_PER_INCH : DEFAULT_GEOMETRY.marginRightIn,
      marginBottomIn: bottomTwips ? Number(bottomTwips) / TWIPS_PER_INCH : DEFAULT_GEOMETRY.marginBottomIn,
      marginLeftIn: leftTwips ? Number(leftTwips) / TWIPS_PER_INCH : DEFAULT_GEOMETRY.marginLeftIn,
      bodyFontSizePt,
      classFontSizePt: nearestClassSize(bodyFontSizePt),
      lineSpacingMultiplier: FIXED_LINE_SPACING_MULTIPLIER,
      paragraphAfterPt,
    };
  } catch {
    return DEFAULT_GEOMETRY;
  }
}
