/**
 * GARY — the HONEST NotebookLM session check (shared by every login path).
 *
 * Why this exists: `login` used to declare success as soon as the cookie jar carried SID +
 * __Secure-1PSID and the tab sat on a notebooklm host. Neither proves anything — Google keeps those
 * cookies around after a session dies, and `notebook.google.com/login` is the NOT-signed-in route.
 * The result was the worst possible failure mode: "Verificar sesión" reported connected, cookies.json
 * got overwritten with a dead session, and the ingest died later on `notebooks create` with
 * "NotebookLM redirected to Google login".
 *
 * The only check that means anything is the one the ingest itself will do: resolve the host, load the
 * app page, and PROBE a real read-only RPC. If LIST_NOTEBOOKS answers 200, `notebooks create` works.
 */
import { RPCClient } from './rpc-client.js';
import { RPC } from './rpc-types.js';

/**
 * Throws unless `cookieMap` genuinely authorizes NotebookLM RPCs.
 * Returns the cookie map REFRESHED by `init()` — Google rotates `__Secure-1PSIDTS` mid-chain, so the
 * jar that came back from the browser is not the jar the next request should send.
 */
export async function assertSessionAuthorizes(
  cookieMap: Record<string, string>,
): Promise<Record<string, string>> {
  return (await probeSession(cookieMap)).cookieMap;
}

/** Same probe, but also reports WHICH Google account answered (see `RPCClient.getAccountEmail`). */
export async function probeSession(
  cookieMap: Record<string, string>,
): Promise<{ cookieMap: Record<string, string>; account: string }> {
  const rpc = new RPCClient({ ...cookieMap });
  await rpc.init(); // follows the redirect chain, pins the resolved origin, extracts SNlM0e
  await rpc.execute(RPC.LIST_NOTEBOOKS, [null, 1], '/'); // 401 here = the session can't drive RPCs
  return { cookieMap: rpc.getCookieMap(), account: rpc.getAccountEmail() };
}

/** Boolean flavour of {@link assertSessionAuthorizes} — never throws. */
export async function sessionAuthorizes(cookieMap: Record<string, string>): Promise<boolean> {
  try {
    await assertSessionAuthorizes(cookieMap);
    return true;
  } catch {
    return false;
  }
}
