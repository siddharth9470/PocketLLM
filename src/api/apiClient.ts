// 1. Simple Type Definitions
export type ApiResult<T> = {
  data: T;
  status: number;
  headers: Headers;
};

export type RequestOptions = {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

// 2. Helper to build URLs with Query Params
function buildUrl(endpoint: string, params?: Record<string, unknown>): string {
  const baseUrl = API_CONFIG.BASE_URL.replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = new URL(`${baseUrl}${path}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

// 3. Core Request Function (The Engine)
async function request<T>(
  method: HttpMethod,
  endpoint: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<ApiResult<T>> {
  const url = buildUrl(endpoint, options?.params);

  // Setup Timeout
  const controller = new AbortController();
  const id = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? API_CONFIG.TIMEOUT_MS,
  );

  const config: RequestInit = {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: options?.signal ?? controller.signal,
  };

  try {
    const response = await fetch(url, config);
    clearTimeout(id);

    // Parse JSON safely
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(
        data?.message || `Error ${response.status}: ${response.statusText}`,
      );
    }

    return {
      data: data as T,
      status: response.status,
      headers: response.headers,
    };
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// 4. Exported Convenience Functions (What you use in your code)
export const getRequest = <T>(
  endpoint: string,
  params?: Record<string, unknown>,
  options?: RequestOptions,
) => request<T>("GET", endpoint, undefined, { ...options, params });

export const postRequest = <T>(
  endpoint: string,
  data?: unknown,
  options?: RequestOptions,
) => request<T>("POST", endpoint, data, options);

export const putRequest = <T>(
  endpoint: string,
  data?: unknown,
  options?: RequestOptions,
) => request<T>("PUT", endpoint, data, options);

export const deleteRequest = <T>(endpoint: string, options?: RequestOptions) =>
  request<T>("DELETE", endpoint, undefined, options);

export const getApiConfig = () => {};

const API_CONFIG = {
  BASE_URL: "https://huggingface.co/",
  TIMEOUT_MS: 15000,
};
