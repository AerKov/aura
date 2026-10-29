import { describe, expect, test } from "bun:test";
import { formatBytes, mimeOf, previewKind, safeFileName } from "./files";

describe("files (ADR 0036)", () => {
  test("a media type comes from the extension, unknown ones are plain bytes", () => {
    expect(mimeOf("Invoice.PDF")).toBe("application/pdf");
    expect(mimeOf("photo.jpeg")).toBe("image/jpeg");
    expect(mimeOf("noext")).toBe("application/octet-stream");
    expect(mimeOf("archive.tar.gz")).toBe("application/octet-stream");
  });

  test("the viewer shows PDFs, images and text only", () => {
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("text/csv")).toBe("text");
    expect(previewKind("application/json")).toBe("text");
    expect(previewKind("application/zip")).toBe("none");
  });

  test("names lose paths, control characters and leading dots", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\me\\bill.pdf")).toBe("bill.pdf");
    expect(safeFileName(".hidden")).toBe("hidden");
    expect(safeFileName("a\u0000b?.txt")).toBe("ab.txt");
    expect(safeFileName("   ")).toBe("file");
    const long = safeFileName(`${"x".repeat(200)}.pdf`);
    expect(long.length).toBe(120);
    expect(long.endsWith(".pdf")).toBe(true);
  });

  test("sizes read like a person would say them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2 MB");
  });
});
