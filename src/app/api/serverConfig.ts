export interface ServerConfig {
  ip: string;
  port: string;
}

const STORAGE_KEY = 'commercial_unit_server_config';

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  ip: '',
  port: '',
};

const normalizeIp = (ip: string) => ip.trim().replace(/^https?:\/\//, '').replace(/\/*$/, '');
const normalizePort = (port: string) => port.trim();

export const loadServerConfig = (): ServerConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ServerConfig;
      if (parsed?.ip && parsed?.port) {
        return {
          ip: normalizeIp(parsed.ip),
          port: normalizePort(parsed.port),
        };
      }
    }
  } catch {
    // ignore malformed stored config
  }

  return {
    ip: '',
    port: '',
  };
};

export const saveServerConfig = (config: ServerConfig): void => {
  const stored = {
    ip: normalizeIp(config.ip),
    port: normalizePort(config.port),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
};

export const getApiBaseUrl = (config?: ServerConfig): string => {
  const { ip, port } = config ?? loadServerConfig();
  const normalizedIp = normalizeIp(ip);
  const normalizedPort = normalizePort(port);
  if (!normalizedIp || !normalizedPort) {
    return window.location.origin;
  }
  return `http://${normalizedIp}:${normalizedPort}`;
};

export const getApiUrl = (path: string, config?: ServerConfig): string => {
  const base = getApiBaseUrl(config);
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

export const getSharedImageUrl = (value: string, config?: ServerConfig): string => {
  const imageUrl = value.trim();
  if (!imageUrl || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return imageUrl;
  }

  const baseUrl = getApiBaseUrl(config);
  if (imageUrl.startsWith('/') || !/^https?:\/\//i.test(imageUrl)) {
    return getApiUrl(imageUrl, config);
  }

  try {
    const parsedUrl = new URL(imageUrl);
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsedUrl.hostname)) {
      parsedUrl.protocol = new URL(baseUrl).protocol;
      parsedUrl.host = new URL(baseUrl).host;
    }
    return parsedUrl.toString();
  } catch {
    return imageUrl;
  }
};

export const checkServerConnection = async (config: ServerConfig, timeoutMs = 5000): Promise<void> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(getApiUrl('/health', config), {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
};
