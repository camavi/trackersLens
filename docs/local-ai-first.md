# Local AI First

Point 8 makes local AI providers first-class runtime providers.

## Default Providers

`js/tl-ai-runtime-store.js` defines local provider defaults:

- Ollama
  - id: `local_ollama`
  - endpoint: `http://127.0.0.1:11434`
  - health path: `/api/tags`
- LM Studio
  - id: `local_lm_studio`
  - endpoint: `http://127.0.0.1:1234/v1`
  - health path: `/models`

They are marked as:

```json
{
  "local": true,
  "localFirst": true,
  "priority": 10
}
```

Lower priority number means earlier provider routing.

## APIs

`window.TrackerLensAiRuntimeStore` exposes:

- `localProviderDefaults()`
- `seedLocalProviders()`
- `probeProvider(provider)`
- `probeLocalProviders()`

`list()` always includes local provider defaults even before they are persisted, sorted before cloud providers.

## Settings

`settings.html` defaults to:

- provider: `Ollama`
- model: `llama3.1`
- `localFirst: true`

The AI settings panel includes a `Local AI first` toggle.

## AI Runtime Center

`ai.html` can probe local providers from the Providers panel using `Probe Local`.

The probe only touches local endpoints and persists provider status/latency to `tl_ai_providers`.

## Current Limits

- No chat/completion runtime router yet.
- No model selection fetch/parsing yet beyond health probe.
- Browser CORS may block local endpoints until Ollama/LM Studio are configured to allow the extension origin.
