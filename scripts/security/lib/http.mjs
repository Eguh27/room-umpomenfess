const DEFAULT_TIMEOUT_MS = 20_000;

function parseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorFromBody(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.message || body.error_description || body.msg || body.error) return body;
  return null;
}

export function createHttp(config) {
  function headersFor({ token, service, extraHeaders = {} }) {
    const headers = {
      apikey: service ? config.serviceKey : config.anonKey,
      ...extraHeaders,
    };
    if (service) headers.Authorization = `Bearer ${config.serviceKey}`;
    else if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function send(url, options = {}) {
    const {
      method = 'GET',
      token,
      service = false,
      body,
      prefer,
      extraHeaders = {},
      timeoutMs = DEFAULT_TIMEOUT_MS,
    } = options;
    const headers = headersFor({ token, service, extraHeaders });
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;

    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    const data = parseBody(text);
    return {
      ok: response.ok,
      status: response.status,
      data,
      text,
      error: errorFromBody(data),
    };
  }

  return {
    send,
    rest(path, options = {}) {
      return send(`${config.url}/rest/v1/${path}`, options);
    },
    rpc(name, args = {}, options = {}) {
      return send(`${config.url}/rest/v1/rpc/${name}`, {
        ...options,
        method: 'POST',
        body: args,
        prefer: options.prefer ?? 'return=representation',
      });
    },
    auth(path, options = {}) {
      return send(`${config.url}/auth/v1${path}`, options);
    },
    admin(path, options = {}) {
      return send(`${config.url}/auth/v1/admin${path}`, {
        ...options,
        service: true,
      });
    },
  };
}

export function responseError(result) {
  if (!result) return 'tidak ada respons';
  if (result.error) {
    return [result.error.code, result.error.message, result.error.details]
      .filter(Boolean)
      .join(' | ');
  }
  return result.text || `HTTP ${result.status}`;
}

export function isDenied(result) {
  return !result.ok || (Array.isArray(result.data) && result.data.length === 0);
}

export function isArray(result) {
  return result.ok && Array.isArray(result.data);
}
