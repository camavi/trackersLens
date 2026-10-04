// A disposable browser worker: no Node, filesystem paths, OCR downloads or macros.
self.window = self;
self.onmessage = async ({ data }) => {
  try {
    const { parseOffice } = await import('../../node_modules/officeparser/dist/officeparser.browser.slim.mjs');
    const ast = await parseOffice(new Uint8Array(data.bytes), {
      fileType: data.extension,
      ocr: false, extractAttachments: false, ignoreNotes: false,
      pdfWorkerSrc: new URL('../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href,
      decompressionLimits: { maxUncompressedBytes: Infinity, maxZipEntries: Infinity, maxTableCells: Infinity, maxXmlElements: Infinity, maxRawContentLength: Infinity, maxRepeatedContent: Infinity },
      pdfParserConfig: { maxTextItems: Infinity, maxOperators: Infinity, maxAnnotations: Infinity, maxTimeMs: Infinity },
    });
    const result = await ast.to('text');
    self.postMessage({ text: result.value, warnings: ast.warnings || [] });
  } catch (error) { self.postMessage({ error: error.message || String(error) }); }
};
