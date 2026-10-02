// Account transport is owned by Main. Cookies and CSRF tokens never cross IPC.
const normalizeOrigin = (value) => {
  const url = new URL(String(value || ""));
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Inserisci un'origine HTTPS, oppure HTTP su localhost, senza percorsi o credenziali.");
  }
  return url.origin;
};

const createAccountClient = ({ persistence, sessionForOrigin, defaultBaseUrl = "" }) => {
  // The packaged desktop app has a canonical account service; development
  // keeps using the local Laravel instance. A user-saved origin always wins.
  const defaultOrigin = defaultBaseUrl ? normalizeOrigin(defaultBaseUrl) : "";
  let busy = false;
  const config = () => {
    const saved = persistence.readDevelopmentRecordById({ storeName: "tl_settings", id: "desktop-account" });
    const baseUrl = saved?.baseUrl ? normalizeOrigin(saved.baseUrl) : defaultOrigin;
    return { baseUrl, configured: Boolean(baseUrl) };
  };
  const projectUser = (user) => {
    if (!user || !user.id || typeof user.email !== "string" || typeof user.name !== "string") throw new Error("Risposta account non valida.");
    return { id: user.id, name: user.name, email: user.email, created_at: user.created_at || null, email_verified_at: user.email_verified_at || null };
  };
  const execute = async (action, payload = {}) => {
    if (action === "configuration") return config();
    if (busy) throw new Error("Un'operazione account è già in corso.");
    busy = true;
    try {
      if (action === "configure") {
        const baseUrl = normalizeOrigin(payload.baseUrl);
        const previous = config().baseUrl;
        if (previous && previous !== baseUrl) await sessionForOrigin(previous).clearStorageData();
        persistence.writeDevelopmentRecords({ storeName: "tl_settings", records: [{ id: "desktop-account", baseUrl }] });
        return config();
      }
      const { baseUrl } = config();
      if (!baseUrl) throw new Error("Configura il server account prima di accedere.");
      const transport = sessionForOrigin(baseUrl);
      const request = async (path, method = "GET", body, retry = true) => {
        const headers = { Accept: "application/json", Origin: baseUrl, Referer: `${baseUrl}/` };
        if (method !== "GET") {
          await request("/sanctum/csrf-cookie");
          const cookies = await transport.cookies.get({ url: baseUrl, name: "XSRF-TOKEN" });
          if (!cookies[0]?.value) throw new Error("Il server non ha inizializzato la sessione protetta.");
          headers["X-XSRF-TOKEN"] = decodeURIComponent(cookies[0].value);
        }
        if (body) headers["Content-Type"] = "application/json";
        const response = await transport.fetch(`${baseUrl}${path}`, {
          method, headers, credentials: "include", redirect: "error",
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (response.status === 419 && method !== "GET" && retry) return request(path, method, body, false);
        if (response.status === 204) return null;
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          const error = new Error(data?.message || `Richiesta account non riuscita (${response.status}).`);
          error.status = response.status;
          error.errors = data?.errors || {};
          throw error;
        }
        if (!data && path !== "/sanctum/csrf-cookie") throw new Error("Il server non ha restituito una risposta account valida.");
        return data;
      };
      const fields = (...keys) => Object.fromEntries(keys.map(key => [key, String(payload[key] || "")]));
      switch (action) {
        case 'catalogSearch': {
          if (!['node', 'flowmap', 'workspace'].includes(payload.kind)) throw new Error('Tipo catalogo non supportato.');
          const query = new URLSearchParams({ kind: payload.kind, query: String(payload.query || ''), page: String(Math.max(1, Number(payload.page) || 1)), mine: payload.mine === true ? '1' : '0' });
          return request(`/api/catalog?${query}`);
        }
        case 'catalogDownload': {
          if (!/^[a-f0-9-]{36}$/i.test(payload.artifactId || '') || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(payload.version || '')) throw new Error('Codice pubblicazione non valido.');
          return request(`/api/catalog/${encodeURIComponent(payload.artifactId)}/versions/${encodeURIComponent(payload.version)}`);
        }
        case 'catalogPublish': return request('/api/catalog', 'POST', payload);
        case "user": return projectUser(await request("/api/user"));
        case "login":
          await request("/api/login", "POST", { ...fields("email", "password"), remember: payload.remember === true });
          return projectUser(await request("/api/user"));
        case "register": return projectUser((await request("/api/register", "POST", fields("name", "email", "password", "password_confirmation")))?.user);
        case "updateProfile": return projectUser(await request("/api/user", "PATCH", fields("name", "email", "current_password")));
        case "updatePassword": await request("/api/user/password", "PUT", fields("current_password", "password", "password_confirmation")); return null;
        case "logout":
          try { await request("/api/logout", "POST"); }
          catch (error) { if (![401, 419].includes(error.status)) throw error; }
          await transport.clearStorageData();
          return null;
        default: throw new Error("Operazione account non supportata.");
      }
    } finally { busy = false; }
  };
  // Electron strips custom Error fields. Return a narrow serializable envelope.
  return { async dispatch(action, payload) {
    try { return { ok: true, data: await execute(action, payload) }; }
    catch (error) { return { ok: false, error: { message: error.message, status: Number(error.status) || 0, errors: error.errors || {} } }; }
  } };
};

module.exports = { createAccountClient, normalizeOrigin };
