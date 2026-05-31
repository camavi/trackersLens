# Icon selects

Trackers Lens keeps the Material Icons list local in:

- `data/material-icons-list.json`: source snapshot from the Material Icons gist.
- `js/tl-material-icon-options.js`: generated runtime option list exposed as `window.TrackerLensMaterialIconOptions`.

Any UI that needs an icon picker/select must use this local option list instead of fetching a remote URL at runtime. In Flow Map, use `FLOW_NODE_ICON_OPTIONS` for required node icons and `FLOW_COMPONENT_ICON_OPTIONS` when an empty/default icon choice is allowed.

CMSwift select pattern:

```js
_.Select({
  label: "Icon",
  value: currentIcon,
  options: FLOW_NODE_ICON_OPTIONS,
  filterable: true,
  filterPlaceholder: "Search icon",
});
```
