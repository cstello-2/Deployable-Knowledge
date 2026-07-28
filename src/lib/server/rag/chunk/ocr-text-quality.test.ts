import assert from "node:assert/strict";
import test from "node:test";
import { cleanOcrText, isUsefulImageText } from "./ocr-text-quality";

const richNativePage =
  "Command and control doctrine explains how commanders organize forces, " +
  "share information, make decisions, and coordinate operations across " +
  "multiple domains during contested missions.";

test("rejects short OCR garbage from a PDF background image", () => {
  assert.equal(
    cleanOcrText("MAY CENTEI\n0 Cc RTIS |\nhd", {
      confidence: 91,
      nativeText: richNativePage,
    }),
    null,
  );
  assert.equal(isUsefulImageText("MAY CENTEI 0 Cc RTIS | hd"), false);
});

test("rejects low-confidence OCR even when it resembles prose", () => {
  assert.equal(
    cleanOcrText(
      "Sensor fusion provides shared awareness for distributed mission teams.",
      { confidence: 42 },
    ),
    null,
  );
});

test("keeps substantial image text on a page with native text", () => {
  const imageText =
    "Sensor fusion enables faster command and control decisions across " +
    "distributed units during degraded operations.";

  assert.equal(
    cleanOcrText(imageText, {
      confidence: 87,
      nativeText: richNativePage,
    }),
    imageText,
  );
});

test("rejects OCR that duplicates the native PDF text layer", () => {
  const duplicate =
    "Command and control doctrine explains how commanders organize forces";

  assert.equal(
    cleanOcrText(duplicate, {
      confidence: 94,
      nativeText: richNativePage,
    }),
    null,
  );
});

test("keeps a useful scanned-page heading without native text", () => {
  const heading = "TACTICAL COMBAT CASUALTY CARE FIELD REFERENCE GUIDE";
  assert.equal(
    cleanOcrText(heading, { confidence: 82 }),
    heading,
  );
});
