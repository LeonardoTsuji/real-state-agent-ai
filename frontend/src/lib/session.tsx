import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { QueryClient } from "@tanstack/react-query";
import type { User } from "./types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 15000 },
    mutations: { retry: false },
  },
});
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
let token: string | null = null;
let generation = 0;
let expiresAt = 0;
const pending = new Set<AbortController>();
let clearSession = () => {};
let revalidate = async () => {};
function resetTransport() {
  generation++;
  token = null;
  expiresAt = 0;
  for (const controller of pending) controller.abort();
  pending.clear();
  void queryClient.cancelQueries();
  queryClient.clear();
}
const translations: Record<number, string> = {
  400: "Revise os campos informados.",
  401: "E-mail ou senha incorretos, ou sessão expirada.",
  403: "Você não tem permissão para esta operação.",
  404: "Recurso indisponível.",
  409: "Os dados mudaram ou existe um conflito. Atualize e tente novamente.",
  429: "Muitas solicitações. Aguarde antes de tentar novamente.",
  500: "Não foi possível concluir. Tente novamente.",
};
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  key?: string,
  signal?: AbortSignal,
): Promise<T> {
  const isPublic =
    path.startsWith("/auth/login") || path.startsWith("/auth/register");
  if (!isPublic && (!token || Date.now() >= expiresAt)) {
    clearSession();
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Sua sessão expirou. Entre novamente.",
    );
  }
  const current = generation;
  const controller = new AbortController();
  pending.add(controller);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(
      path.startsWith("/api/") ? path : `/api${path}`,
      {
        method,
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(!isPublic && token ? { Authorization: `Bearer ${token}` } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      },
    );
    if (current !== generation)
      throw new DOMException("Sessão alterada", "AbortError");
    if (response.status === 204) {
      if (method !== "GET" && !isPublic) void queryClient.invalidateQueries();
      return undefined as T;
    }
    const data = await response.json().catch(() => null);
    if (current !== generation)
      throw new DOMException("Sessão alterada", "AbortError");
    if (!response.ok) {
      if (response.status === 401 && !isPublic) clearSession();
      if (response.status === 403 && path.startsWith("/operations")) {
        await queryClient.cancelQueries({
          predicate: (q) => JSON.stringify(q.queryKey).includes("operations"),
        });
        queryClient.removeQueries({
          predicate: (q) => JSON.stringify(q.queryKey).includes("operations"),
        });
        void revalidate();
      }
      const message =
        data?.code === "EMAIL_ALREADY_REGISTERED"
          ? "Este e-mail já está cadastrado."
          : typeof data?.message === "string" &&
              /[áãçéêíóõú]/.test(data.message)
            ? data.message
            : (translations[response.status] ??
              "Não foi possível concluir a solicitação.");
      throw new ApiError(
        response.status,
        data?.code ?? "HTTP_ERROR",
        message,
        data?.details,
      );
    }
    if (method !== "GET" && !isPublic) void queryClient.invalidateQueries();
    return data as T;
  } catch (error) {
    if (error instanceof ApiError || error instanceof DOMException) throw error;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Sem conexão com a API. Seus dados foram preservados; tente novamente.",
    );
  } finally {
    pending.delete(controller);
    signal?.removeEventListener("abort", abort);
  }
}
export const api = {
  get: <T = any,>(path: string, signal?: AbortSignal) =>
    request<T>("GET", path, undefined, undefined, signal),
  post: <T = any,>(path: string, body?: unknown, key?: string) =>
    request<T>("POST", path, body, key),
  patch: <T = any,>(path: string, body?: unknown) =>
    request<T>("PATCH", path, body),
  delete: <T = any,>(path: string) => request<T>("DELETE", path),
  async blob(path: string): Promise<Blob> {
    if (!token || Date.now() >= expiresAt) {
      clearSession();
      throw new ApiError(401, "UNAUTHORIZED", "Entre novamente.");
    }
    const current = generation;
    const controller = new AbortController();
    pending.add(controller);
    try {
      const r = await fetch(`/api${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (current !== generation)
        throw new DOMException("Sessão alterada", "AbortError");
      if (!r.ok) {
        if (r.status === 401) clearSession();
        throw new ApiError(
          r.status,
          "DOWNLOAD_ERROR",
          "Não foi possível baixar o documento.",
        );
      }
      const blob = await r.blob();
      if (current !== generation)
        throw new DOMException("Sessão alterada", "AbortError");
      return blob;
    } finally {
      pending.delete(controller);
    }
  },
};
interface Session {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshIdentity: () => Promise<void>;
  authenticated: boolean;
}
const SessionContext = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const logout = () => {
    resetTransport();
    setUser(null);
  };
  const refreshIdentity = async () => {
    if (!token) return;
    const identity = await api.get<User>("/auth/me");
    setUser(identity);
  };
  clearSession = logout;
  revalidate = refreshIdentity;
  const login = async (email: string, password: string) => {
    logout();
    const response = await api.post<{ accessToken: string; expiresIn: number }>(
      "/auth/login",
      { email, password },
    );
    token = response.accessToken;
    expiresAt = Date.now() + response.expiresIn * 1000;
    try {
      await refreshIdentity();
    } catch (e) {
      logout();
      throw e;
    }
  };
  useEffect(() => {
    if (!user) return;
    const timeout = setTimeout(logout, Math.max(0, expiresAt - Date.now()));
    const focus = () => {
      if (Date.now() >= expiresAt) logout();
      else void refreshIdentity().catch(() => {});
    };
    window.addEventListener("focus", focus);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("focus", focus);
    };
  }, [user?.id]);
  return (
    <SessionContext.Provider
      value={{ user, login, logout, refreshIdentity, authenticated: !!user }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("SessionProvider ausente");
  return context;
}
