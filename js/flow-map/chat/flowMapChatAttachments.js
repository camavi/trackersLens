// Attachment classification and provider projections. Browser I/O is injected.
const createFlowMapChatAttachments = ({
  messageId: flowPromptMessageId,
  readDataUrl: flowPromptReadDataUrl,
  extractDocument: flowPromptExtractDocument,
}) => {
  const flowPromptReadAttachment = async (file, signal) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = String(file.name || "Allegato");
    const mime = String(file.type || "").toLowerCase();
    const base = { id: flowPromptMessageId("attachment"), name, mime, size: bytes.length };
    if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)) {
      const dataUrl = await flowPromptReadDataUrl(file);
      return { ...base, kind: "image", dataUrl };
    }
    const extension = name.split(".").pop().toLowerCase();
    if (["pdf", "docx", "xlsx", "pptx", "odt", "ods", "odp", "rtf"].includes(extension)) {
      const extracted = await flowPromptExtractDocument(bytes, extension, signal).catch(error => { throw new Error(`${name}: ${error.message}`); });
      return { ...base, kind: "document", text: extracted.text, dataUrl: await flowPromptReadDataUrl(file),
        warnings: extracted.warnings,
        extractionNote: "Testo estratto localmente; layout, immagini incorporate e macro non sono inviati al modello. OCR non eseguito." + (!extracted.text.trim() ? " Nessun testo estraibile: allega le pagine come immagini per analizzarle." : ""),
      };
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new Error("binary");
      return { ...base, kind: "text", text };
    } catch (_) {
      throw new Error(`${name}: formato non supportato. Allega PDF, DOCX, XLSX, PPTX, OpenDocument, RTF, immagini PNG/JPEG/WebP/GIF o testo UTF-8. I formati Office legacy DOC/XLS/PPT vanno convertiti nei formati moderni.`);
    }
  };
  const flowPromptAttachmentContext = (items = []) => items.map(({ id, name, mime, size, kind, text, warnings, extractionNote }) => ({
    id, name, mime, size, kind, warnings, extractionNote, ...(kind !== "image" ? { text } : { image: "Supplied as a native image input, in attachment order." }),
  }));
  const flowPromptImageInputs = (conversationContext, attachments = []) => {
    const seen = new Set();
    return [...(conversationContext?.recent || []).flatMap(message => message.attachments || []), ...attachments]
      .filter(item => {
        if (item.kind !== "image" || (item.id && seen.has(item.id))) return false;
        if (item.id) seen.add(item.id);
        return true;
      }).map(({ mime, dataUrl }) => ({ mime, data: String(dataUrl).split(",")[1] }));
  };
  const flowPromptMultimodalContent = (prompt, images = []) => images.length
    ? [{ type: "text", text: prompt }, ...images.map(image => ({ type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data}` } }))]
    : prompt;

  return {
    flowPromptReadAttachment,
    flowPromptAttachmentContext,
    flowPromptImageInputs,
    flowPromptMultimodalContent
  };
};
