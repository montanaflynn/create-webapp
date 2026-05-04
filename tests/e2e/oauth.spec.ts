import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

// End-to-end coverage of the OAuth 2.1 + PKCE flow. Drives the full path:
// discovery → DCR → consent (browser-driven) → code exchange → access on
// /api/mcp → refresh → revoke. Mirrors the spec sequence so a regression
// shows up close to the spec violation.
//
// PKCE helper: generate a random verifier and its base64url-encoded
// SHA-256 challenge.

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function registerClient(
  request: APIRequestContext,
  redirectUri: string,
  name = "OAuth e2e client",
) {
  const r = await request.post("/api/oauth/register", {
    headers: { "Content-Type": "application/json" },
    data: { redirect_uris: [redirectUri], client_name: name },
  });
  expect(r.status()).toBe(201);
  return (await r.json()) as { client_id: string };
}

async function exchangeCode(
  request: APIRequestContext,
  params: {
    code: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
  },
) {
  return request.post("/api/oauth/token", {
    headers: { "Content-Type": "application/json" },
    data: {
      grant_type: "authorization_code",
      code: params.code,
      code_verifier: params.codeVerifier,
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
    },
  });
}

const REDIRECT_URI = "http://127.0.0.1:9999/cb";

test.describe("OAuth — discovery and DCR", () => {
  test("/api/mcp 401 includes WWW-Authenticate pointing at protected-resource metadata", async ({
    request,
  }) => {
    const r = await request.post("/api/mcp", {
      headers: { "Content-Type": "application/json" },
      data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect(r.status()).toBe(401);
    const wwwAuth = r.headers()["www-authenticate"] ?? "";
    expect(wwwAuth).toContain("Bearer");
    expect(wwwAuth).toContain("oauth-protected-resource");
  });

  test("/.well-known/oauth-authorization-server returns valid metadata", async ({
    request,
  }) => {
    const r = await request.get("/.well-known/oauth-authorization-server");
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.issuer).toBeTruthy();
    expect(j.authorization_endpoint).toContain("/api/oauth/authorize");
    expect(j.token_endpoint).toContain("/api/oauth/token");
    expect(j.registration_endpoint).toContain("/api/oauth/register");
    expect(j.revocation_endpoint).toContain("/api/oauth/revoke");
    expect(j.code_challenge_methods_supported).toContain("S256");
    expect(j.grant_types_supported).toContain("authorization_code");
    expect(j.grant_types_supported).toContain("refresh_token");
  });

  test("/.well-known/oauth-protected-resource references /api/mcp", async ({
    request,
  }) => {
    const r = await request.get("/.well-known/oauth-protected-resource");
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.resource).toContain("/api/mcp");
    expect(Array.isArray(j.authorization_servers)).toBe(true);
  });

  test("POST /api/oauth/register returns a client_id", async ({ request }) => {
    const r = await request.post("/api/oauth/register", {
      headers: { "Content-Type": "application/json" },
      data: {
        redirect_uris: [REDIRECT_URI],
        client_name: "Registration test",
      },
    });
    expect(r.status()).toBe(201);
    const j = await r.json();
    expect(j.client_id).toMatch(/^oac_/);
    expect(j.redirect_uris).toEqual([REDIRECT_URI]);
  });

  test("register rejects non-https / non-localhost redirect_uri", async ({
    request,
  }) => {
    const r = await request.post("/api/oauth/register", {
      headers: { "Content-Type": "application/json" },
      data: { redirect_uris: ["http://evil.example/cb"] },
    });
    expect(r.status()).toBe(400);
    const j = await r.json();
    expect(j.error).toBe("invalid_client_metadata");
  });
});

test.describe("OAuth — full authorization flow", () => {
  test("authorize → token → MCP access → refresh → revoke", async ({
    page,
    request,
  }) => {
    const { client_id } = await registerClient(request, REDIRECT_URI);
    const { verifier, challenge } = pkce();
    const state = randomBytes(8).toString("hex");

    const authorizeUrl = new URL(
      "/api/oauth/authorize",
      "http://localhost:3001",
    );
    authorizeUrl.searchParams.set("client_id", client_id);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "notes:read notes:write tags:read");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    // The redirect_uri (127.0.0.1:9999) won't actually serve a response —
    // catch the navigation and pull the code out of the URL ourselves.
    // Playwright's request listener fires before the network request goes
    // out, which is enough to capture the URL.
    await page.context().route(`${REDIRECT_URI}*`, async (route) => {
      await route.fulfill({ status: 200, body: "OK" });
    });

    await page.goto(authorizeUrl.toString());
    await expect(page.getByText(/Authorize OAuth e2e client/)).toBeVisible();

    const navPromise = page.waitForURL(`${REDIRECT_URI}*`);
    await page.getByRole("button", { name: "Authorize", exact: true }).click();
    await navPromise;

    const landed = new URL(page.url());
    expect(landed.searchParams.get("state")).toBe(state);
    const code = landed.searchParams.get("code");
    expect(code).toBeTruthy();

    // Exchange code for tokens.
    const tokenRes = await exchangeCode(request, {
      code: code!,
      codeVerifier: verifier,
      clientId: client_id,
      redirectUri: REDIRECT_URI,
    });
    expect(tokenRes.status()).toBe(200);
    const tokens = await tokenRes.json();
    expect(tokens.access_token).toMatch(/^oat_acc_/);
    expect(tokens.refresh_token).toMatch(/^oat_rfr_/);
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.expires_in).toBeGreaterThan(0);

    // Use the access token at /api/mcp.
    const mcp = await request.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "playwright", version: "1.0.0" },
        },
      },
    });
    expect(mcp.status()).toBe(200);

    const list = await request.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });
    expect(list.status()).toBe(200);
    const listed = await list.json();
    const names = (listed.result.tools as { name: string }[])
      .map((t) => t.name)
      .sort();
    expect(names).toContain("notes_list");

    // Refresh: old refresh_token returns new pair.
    const refreshed = await request.post("/api/oauth/token", {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id,
      },
    });
    expect(refreshed.status()).toBe(200);
    const fresh = await refreshed.json();
    expect(fresh.access_token).toMatch(/^oat_acc_/);
    expect(fresh.refresh_token).toMatch(/^oat_rfr_/);
    expect(fresh.access_token).not.toBe(tokens.access_token);

    // Re-using the original refresh_token now fails.
    const replay = await request.post("/api/oauth/token", {
      headers: { "Content-Type": "application/json" },
      data: {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id,
      },
    });
    expect(replay.status()).toBe(400);
    expect((await replay.json()).error).toBe("invalid_grant");

    // Revoke the new access token.
    const revoke = await request.post("/api/oauth/revoke", {
      headers: { "Content-Type": "application/json" },
      data: { token: fresh.access_token },
    });
    expect(revoke.status()).toBe(200);

    // Subsequent /api/mcp call rejects.
    const after = await request.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${fresh.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 99, method: "initialize", params: {} },
    });
    expect(after.status()).toBe(401);
  });

  test("authorization code is single-use", async ({ page, request }) => {
    const { client_id } = await registerClient(request, REDIRECT_URI);
    const { verifier, challenge } = pkce();

    const url = new URL(
      "/api/oauth/authorize",
      "http://localhost:3001",
    );
    url.searchParams.set("client_id", client_id);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "notes:read");
    url.searchParams.set("state", "single-use");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");

    await page.context().route(`${REDIRECT_URI}*`, async (route) => {
      await route.fulfill({ status: 200, body: "OK" });
    });
    await page.goto(url.toString());
    const navPromise = page.waitForURL(`${REDIRECT_URI}*`);
    await page.getByRole("button", { name: "Authorize", exact: true }).click();
    await navPromise;
    const code = new URL(page.url()).searchParams.get("code")!;

    const first = await exchangeCode(request, {
      code,
      codeVerifier: verifier,
      clientId: client_id,
      redirectUri: REDIRECT_URI,
    });
    expect(first.status()).toBe(200);

    const second = await exchangeCode(request, {
      code,
      codeVerifier: verifier,
      clientId: client_id,
      redirectUri: REDIRECT_URI,
    });
    expect(second.status()).toBe(400);
    expect((await second.json()).error).toBe("invalid_grant");
  });

  test("PKCE verifier mismatch is rejected", async ({ page, request }) => {
    const { client_id } = await registerClient(request, REDIRECT_URI);
    const { challenge } = pkce(); // throw away the verifier

    const url = new URL(
      "/api/oauth/authorize",
      "http://localhost:3001",
    );
    url.searchParams.set("client_id", client_id);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "notes:read");
    url.searchParams.set("state", "pkce");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");

    await page.context().route(`${REDIRECT_URI}*`, async (route) => {
      await route.fulfill({ status: 200, body: "OK" });
    });
    await page.goto(url.toString());
    const navPromise = page.waitForURL(`${REDIRECT_URI}*`);
    await page.getByRole("button", { name: "Authorize", exact: true }).click();
    await navPromise;
    const code = new URL(page.url()).searchParams.get("code")!;

    // Wrong verifier — different random.
    const bogusVerifier = randomBytes(32).toString("base64url");
    const r = await exchangeCode(request, {
      code,
      codeVerifier: bogusVerifier,
      clientId: client_id,
      redirectUri: REDIRECT_URI,
    });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toBe("invalid_grant");
  });

  test("Deny redirects with error=access_denied", async ({ page, request }) => {
    const { client_id } = await registerClient(request, REDIRECT_URI);
    const { challenge } = pkce();

    const url = new URL(
      "/api/oauth/authorize",
      "http://localhost:3001",
    );
    url.searchParams.set("client_id", client_id);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "notes:read");
    url.searchParams.set("state", "deny-test");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");

    await page.context().route(`${REDIRECT_URI}*`, async (route) => {
      await route.fulfill({ status: 200, body: "OK" });
    });
    await page.goto(url.toString());
    const navPromise = page.waitForURL(`${REDIRECT_URI}*`);
    await page.getByRole("button", { name: "Deny", exact: true }).click();
    await navPromise;

    const landed = new URL(page.url());
    expect(landed.searchParams.get("error")).toBe("access_denied");
    expect(landed.searchParams.get("state")).toBe("deny-test");
    expect(landed.searchParams.get("code")).toBeNull();
  });
});

test.describe("OAuth — settings & audit log", () => {
  test("connected app appears in /settings/oauth-clients with revoke + audit row", async ({
    page,
    request,
  }) => {
    const clientName = `audit-test-${Date.now()}`;
    const { client_id } = await registerClient(request, REDIRECT_URI, clientName);
    const { verifier, challenge } = pkce();

    const authorizeUrl = new URL(
      "/api/oauth/authorize",
      "http://localhost:3001",
    );
    authorizeUrl.searchParams.set("client_id", client_id);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "notes:read notes:write tags:read");
    authorizeUrl.searchParams.set("state", "settings");
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    await page.context().route(`${REDIRECT_URI}*`, async (route) => {
      await route.fulfill({ status: 200, body: "OK" });
    });
    await page.goto(authorizeUrl.toString());
    const navPromise = page.waitForURL(`${REDIRECT_URI}*`);
    await page.getByRole("button", { name: "Authorize", exact: true }).click();
    await navPromise;
    const code = new URL(page.url()).searchParams.get("code")!;

    const tokens = await (
      await exchangeCode(request, {
        code,
        codeVerifier: verifier,
        clientId: client_id,
        redirectUri: REDIRECT_URI,
      })
    ).json();

    // Use the token to drive a state-changing call so the audit log gets a
    // row sourced from `oauth: <client>`.
    const note = await request.post("/api/v1/notes", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      data: {
        title: `oauth-audit-${Date.now()}`,
        content: "via oauth",
        tags: [],
      },
    });
    expect(note.status()).toBe(201);

    await page.context().unroute(`${REDIRECT_URI}*`);

    // Visit /settings/oauth-clients — entry visible.
    await page.goto("/settings/oauth-clients");
    await expect(page.getByText(clientName)).toBeVisible();

    // Visit /settings/activity — oauth source label.
    await page.goto("/settings/activity");
    await expect(page.getByText(/^oauth:/)).toBeVisible();

    // Revoke via the connected-apps UI.
    await page.goto("/settings/oauth-clients");
    await page
      .getByRole("button", { name: `Revoke ${clientName}` })
      .click();
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(page.getByText(clientName)).toHaveCount(0);

    // Token can no longer hit /api/mcp.
    const after = await request.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: { jsonrpc: "2.0", id: 9, method: "initialize", params: {} },
    });
    expect(after.status()).toBe(401);
  });
});
