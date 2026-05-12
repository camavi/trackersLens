# Trackers Lens CodeMirror 6 Bundle

Bundle locale usato dal plugin per evitare dipendenze CDN dentro le schermate editor.

File runtime:

- `cm6.bundle.js`: espone `window.TLCodeMirror.createEditor(...)`.
- `cm6.css`: stile container/scrollbar per l'editor.

API disponibile:

```js
const editor = window.TLCodeMirror.createEditor({
  parent: document.getElementById("editor-host"),
  doc: ".widget { color: white; }",
  language: "css",
  onChange(value) {
    console.log(value);
  },
});

editor.getValue();
editor.setValue("...");
editor.setLanguage("html");
editor.focus();
editor.destroy();
```

Linguaggi inclusi:

- `css`
- `html`
- `javascript`
- `manifest`, `public` e `json` usano parser JSON.

Nota build:

Il bundle attuale e stato generato in una directory temporanea con `esbuild`, includendo `codemirror`, `@codemirror/lang-css`, `@codemirror/lang-html`, `@codemirror/lang-javascript`, `@codemirror/lang-json` e `@codemirror/theme-one-dark`.

Prossimo passo consigliato: aggiungere un `package.json` o script dedicato al progetto quando serve rigenerare il bundle in modo riproducibile.

