// flow Map Chat Palette Validation.
// State and dependency wiring: js/flow-map/flowMapPromptChat.js.
const createFlowMapChatPaletteValidation = (moduleDependencies) => {
  const flowPromptValidateCreatedNodePalette = (edit = {}) => {
      const metadata = edit.node.metadata || {};
      const palette = metadata.customPackage ? flatPalette().find(item => item.customPackage?.packageId === metadata.customPackage.packageId && item.customPackage.version === metadata.customPackage.version && item.customPackage.archive?.sha256 === metadata.customPackage.archive?.sha256) : (0, moduleDependencies.flowPromptPaletteItem)(metadata.paletteLabel);
      if (!palette) throw Object.assign(new Error("Nodo non più disponibile nella palette: rileggi i tipi di nodo e prepara una nuova proposta."), { code: "TL_PALETTE_CHANGED" });
      const current = (0, moduleDependencies.flowPromptSpecFromPalette)(palette.label, {}, palette);
      const expected = [current.type, current.inputs, current.outputs, current.manifest, current.settingsSchema, current.configRules, current.runtime, current.permissions, current.customPackage, current.runtimeBlocked];
      const actual = [edit.node.type, edit.node.inputs, edit.node.outputs, metadata.manifest, metadata.settingsSchema, metadata.configRules, metadata.runtimeMetadata, metadata.permissions, metadata.customPackage, metadata.runtimeBlocked];
      if ((0, moduleDependencies.flowPromptRequestIdentity)(expected) !== (0, moduleDependencies.flowPromptRequestIdentity)(actual)) throw Object.assign(new Error("Definizione palette cambiata: rileggi i tipi di nodo e prepara una nuova proposta."), { code: "TL_PALETTE_CHANGED" });
      return current;
  };

  const flowPromptRevalidateCreatedNodes = edits => {
    for (const edit of edits.filter(edit => edit.operation === "create")) {
      flowPromptValidateCreatedNodePalette(edit);
      const metadata = edit.node.metadata || {};
      for (const [field, value] of Object.entries(metadata.config || {})) {
        const result = (0, moduleDependencies.flowPromptConfigConstraints)(edit.node, field, value);
        if (!result.ok) throw new Error(result.errors.join("\n"));
        if (field === "endpoint") {
          const endpoint = (0, moduleDependencies.flowPromptValidateEndpointCandidate)({ value, method: metadata.config.method || "GET" });
          if (!endpoint.ok) throw new Error(endpoint.reason);
        }
      }
    }
  };

  return {
    flowPromptValidateCreatedNodePalette,
    flowPromptRevalidateCreatedNodes
  };
};
