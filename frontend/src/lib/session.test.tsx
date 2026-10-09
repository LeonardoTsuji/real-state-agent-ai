import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, queryClient, SessionProvider, useSession } from "./session";
import type { User } from "./types";
let session: ReturnType<typeof useSession>;
const identity: User = {
  id: "broker",
  name: "Marina Costa",
  email: "marina@copilot.demo",
  role: "BROKER",
  permissions: [],
  creci: null,
  monthlyGoalCents: 12000000,
  summary: { leads: 2, properties: 2, visits: 1 },
  demoMode: true,
};
function Probe() {
  session = useSession();
  return <div>{session.user?.name ?? "Sem sessão"}</div>;
}
function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob()),
  } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn((path: string) =>
    Promise.resolve(
      response(
        path.includes("/auth/login")
          ? { accessToken: "in-memory-token", expiresIn: 3600 }
          : identity,
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
});
afterEach(() => {
  act(() => session.logout());
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function login() {
  await act(async () =>
    session.login("marina@copilot.demo", "DemoCopilot2026!"),
  );
  expect(screen.getByText("Marina Costa")).toBeInTheDocument();
}

describe("session lifecycle and authenticated transport", () => {
  it("preserves a nullable resource when the API sends an empty successful body", async () => {
    await login();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    });
    await expect(api.get("/leads/new/preferences")).resolves.toBeNull();
    expect(session.user?.name).toBe("Marina Costa");
  });
  it("keeps credentials out of persistent browser storage", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    await login();
    expect(write).not.toHaveBeenCalled();
    const options = fetchMock.mock.calls.find(
      ([path]) => path === "/api/auth/me",
    )?.[1] as RequestInit | undefined;
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer in-memory-token",
    });
  });
  it("logout discards authenticated caches and prevents another protected request", async () => {
    await login();
    queryClient.setQueryData(["leads", "broker"], [{ id: "private" }]);
    act(() => session.logout());
    expect(queryClient.getQueryData(["leads", "broker"])).toBeUndefined();
    expect(screen.getByText("Sem sessão")).toBeInTheDocument();
    fetchMock.mockClear();
    await expect(api.get("/leads")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("a protected 401 logs out and clears all private data", async () => {
    await login();
    queryClient.setQueryData(["properties", "broker"], [{ id: "private" }]);
    fetchMock.mockResolvedValue(response({ message: "Unauthorized" }, 401));
    await act(async () => {
      await expect(api.get("/properties")).rejects.toMatchObject({
        status: 401,
      });
    });
    expect(screen.getByText("Sem sessão")).toBeInTheDocument();
    expect(queryClient.getQueryData(["properties", "broker"])).toBeUndefined();
  });
  it("rejects a response whose headers arrive after logout", async () => {
    await login();
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const request = api.get("/leads");
    const assertion = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    act(() => session.logout());
    pending.resolve(response({ items: [{ id: "old-user-lead" }] }));
    await assertion;
    expect(screen.getByText("Sem sessão")).toBeInTheDocument();
  });
  it("rejects parsed data arriving after logout even when headers arrived earlier", async () => {
    await login();
    const body = deferred<unknown>();
    const parse = vi.fn(() => body.promise);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: parse });
    const request = api.get("/leads");
    const assertion = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    await waitFor(() => expect(parse).toHaveBeenCalled());
    act(() => session.logout());
    body.resolve({ items: [{ id: "old-user-lead" }] });
    await assertion;
    expect(screen.getByText("Sem sessão")).toBeInTheDocument();
  });
  it("a PDF download returning 401 also clears the authenticated session", async () => {
    await login();
    queryClient.setQueryData(["documents", "broker"], [{ id: "private" }]);
    fetchMock.mockResolvedValue(response({}, 401));
    await act(async () => {
      await expect(
        api.blob("/commercial/documents/document/pdf"),
      ).rejects.toMatchObject({ status: 401 });
    });
    expect(screen.getByText("Sem sessão")).toBeInTheDocument();
    expect(queryClient.getQueryData(["documents", "broker"])).toBeUndefined();
  });
  it("a revoked operational permission clears only operations and revalidates identity", async () => {
    await login();
    queryClient.setQueryData(["operations", "jobs"], [{ id: "global-job" }]);
    queryClient.setQueryData(["leads", "broker"], [{ id: "personal-lead" }]);
    fetchMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("/operations/") ? response({}, 403) : response(identity),
      ),
    );
    await act(async () => {
      await expect(api.get("/operations/jobs")).rejects.toMatchObject({
        status: 403,
      });
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([path]) => path === "/api/auth/me").length,
      ).toBeGreaterThan(1),
    );
    expect(queryClient.getQueryData(["operations", "jobs"])).toBeUndefined();
    expect(queryClient.getQueryData(["leads", "broker"])).toEqual([
      { id: "personal-lead" },
    ]);
    expect(screen.getByText("Marina Costa")).toBeInTheDocument();
  });
  it("aborts pending PDF transport and discards a late downloaded body on logout", async () => {
    await login();
    const downloaded = deferred<Blob>();
    const read = vi.fn(() => downloaded.promise);
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: read });
    const request = api.blob("/commercial/documents/private/pdf");
    const assertion = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    await waitFor(() => expect(read).toHaveBeenCalled());
    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
    act(() => session.logout());
    downloaded.resolve(new Blob(["private document"]));
    await assertion;
    expect(init?.signal?.aborted).toBe(true);
  });
  it("expires the session and clears private queries at the JWT deadline", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((path: string) =>
      Promise.resolve(
        response(
          path.includes("/auth/login")
            ? { accessToken: "short-lived", expiresIn: 1 }
            : identity,
        ),
      ),
    );
    await login();
    queryClient.setQueryData(["leads", "broker"], [{ id: "private" }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1001);
    });
    expect(screen.getByText("Sem sessão")).toBeInTheDocument();
    expect(queryClient.getQueryData(["leads", "broker"])).toBeUndefined();
    await expect(api.get("/leads")).rejects.toMatchObject({ status: 401 });
  });
});
