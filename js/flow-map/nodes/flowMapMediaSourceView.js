// flow Map Media Source View.
// State and dependency wiring: js/flow-map/flowMapRuntimeNodes.js.
const createFlowMapMediaSourceView = (moduleDependencies) => {
  const mediaSourceDropSpec = (subtype = "") => {
    if (subtype === "image-source") return {
      accept: "image/*",
      multiple: false,
      iconName: "add_photo_alternate",
      title: "Drop image",
      hint: "or click to select",
      dataKey: "imageDataUrl",
      nameKey: "imageFileName",
      typeKey: "imageMimeType",
      typePrefix: "image/",
    };
    if (subtype === "audio-source") return {
      accept: "audio/*",
      multiple: false,
      iconName: "library_music",
      title: "Drop audio",
      hint: "or click to select",
      dataKey: "audioDataUrl",
      nameKey: "audioFileName",
      typeKey: "audioMimeType",
      typePrefix: "audio/",
    };
    if (subtype === "file-source") return {
      accept: "",
      multiple: false,
      iconName: "upload_file",
      title: "Drop file",
      hint: "or click to select",
      dataKey: "fileDataUrl",
      nameKey: "fileName",
      typeKey: "mimeType",
      typePrefix: "",
    };
    if (subtype === "files-source") return {
      accept: "",
      multiple: true,
      iconName: "drive_folder_upload",
      title: "Drop files",
      hint: "or click to select",
      dataKey: "filesData",
      nameKey: "batchLabel",
      typeKey: "mimeType",
      typePrefix: "",
    };
    return null;
  };

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });

  const persistMediaSourceFiles = async ({ node = {}, files = [], spec = null } = {}) => {
    const selectedFiles = Array.from(files || []).filter(Boolean);
    if (!node?.id || !selectedFiles.length || !spec) return;
    const validFiles = spec.typePrefix
      ? selectedFiles.filter((file) => String(file.type || "").startsWith(spec.typePrefix))
      : selectedFiles;
    if (!validFiles.length) return;
    if (spec.multiple) {
      const entries = await Promise.all(validFiles.map(async (file) => ({
        name: file.name || "file",
        type: file.type || "application/octet-stream",
        size: file.size || 0,
        dataUrl: await readFileAsDataUrl(file),
      })));
      (0, moduleDependencies.persistInlineRuntimeNodeConfig)({
        node,
        patch: {
          filesData: entries,
          filesJson: JSON.stringify(entries.map(({ name, type, size }) => ({ name, type, size })), null, 2),
          batchLabel: entries.length === 1 ? entries[0].name : `${entries.length} files`,
        },
      });
      return;
    }
    const file = validFiles[0];
    (0, moduleDependencies.persistInlineRuntimeNodeConfig)({
      node,
      patch: {
        [spec.dataKey]: await readFileAsDataUrl(file),
        [spec.nameKey]: file.name || "",
        [spec.typeKey]: file.type || "application/octet-stream",
      },
    });
  };

  const renderMediaSourceDropzone = (node = {}, config = {}) => {
    const subtype = nodeSubtype(node);
    const spec = mediaSourceDropSpec(subtype);
    if (!spec) return null;
    const inputId = `tl-flow-media-source-${String(node.id || "").replace(/[^A-Za-z0-9_-]/g, "_")}`;
    const filesData = Array.isArray(config.filesData) ? config.filesData : [];
    const dataUrl = String(config[spec.dataKey] || "").trim();
    const remoteUrl = subtype === "image-source"
      ? String(config.imageUrl || "").trim()
      : subtype === "audio-source"
        ? String(config.audioUrl || "").trim()
        : "";
    const previewUrl = dataUrl || remoteUrl;
    const hasValue = Boolean(previewUrl || filesData.length || config[spec.nameKey]);
    const handleFiles = (files) => persistMediaSourceFiles({ node, files, spec });
    const handleDrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleFiles(event.dataTransfer?.files || []);
    };
    const summary = spec.multiple
      ? `${filesData.length || 0} file${(filesData.length || 0) === 1 ? "" : "s"}`
      : config[spec.nameKey] || (previewUrl ? "local media" : "");
    return _.label(
      {
        class: `tl-flow-node-media-drop is-${subtype}${hasValue ? " has-media" : ""}`,
        htmlFor: inputId,
        title: `${spec.title} here or click to select`,
        onPointerDown: moduleDependencies.stopNodeControlEvent,
        onclick: moduleDependencies.stopNodeControlEvent,
        ondragover: (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        ondrop: handleDrop,
      },
      _.input({
        id: inputId,
        type: "file",
        accept: spec.accept,
        multiple: spec.multiple,
        onchange: (event) => handleFiles(event.currentTarget.files || []),
      }),
      subtype === "image-source" && previewUrl ? _.img({ src: previewUrl, alt: config.alt || node.label || "Image source preview", loading: "lazy" }) : null,
      subtype === "audio-source" && previewUrl ? _.audio({ src: previewUrl, controls: true }) : null,
      subtype !== "image-source" || !previewUrl ? _.span(
        { class: "tl-flow-node-media-empty" },
        flowMapIcon(spec.iconName, "sm"),
        _.strong(summary || spec.title),
        _.em(hasValue ? "Click or drop to replace" : spec.hint)
      ) : null,
      config.alt && subtype === "image-source" && previewUrl ? _.figcaption(config.alt) : null
    );
  };

  return {
    mediaSourceDropSpec,
    readFileAsDataUrl,
    persistMediaSourceFiles,
    renderMediaSourceDropzone
  };
};
