/**
 * Auth middleware — verifies Supabase Auth JWTs locally with `jose`.
 *
 * Supabase migrated user-session tokens from HS256 (legacy) to ES256
 * (asymmetric, JWKS-served) for new projects. Legacy anon/service keys still
 * use HS256. We support both: peek at the `alg` in the header and dispatch.
 *
 * Org membership is re-fetched per request — no cache, per plan §A.9.
 */

const { jwtVerify, createRemoteJWKSet } = require("jose");
const { sb, SUPABASE_URL } = require("./supabase");

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const HS_KEY = SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(SUPABASE_JWT_SECRET)
  : null;

const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

function peekAlg(token) {
  try {
    const [headerB64] = token.split(".");
    return JSON.parse(Buffer.from(headerB64, "base64url").toString()).alg || "ES256";
  } catch {
    return "ES256";
  }
}

async function verifyToken(token) {
  const alg = peekAlg(token);
  if (alg === "HS256") {
    if (!HS_KEY) throw new Error("HS256 token but SUPABASE_JWT_SECRET not set");
    const { payload } = await jwtVerify(token, HS_KEY, { algorithms: ["HS256"] });
    return payload;
  }
  // ES256 / modern Supabase Auth (JWKS).
  const { payload } = await jwtVerify(token, JWKS, { algorithms: ["ES256"] });
  return payload;
}

async function loadActiveOrg(userId) {
  // profiles uses user_id (verified vs migration 027).
  const [{ data: profile, error: pErr }, { data: members, error: mErr }] =
    await Promise.all([
      sb
        .from("profiles")
        .select("current_org_id, full_name")
        .eq("user_id", userId)
        .maybeSingle(),
      sb
        .from("organization_members")
        .select("org_id, role")
        .eq("user_id", userId),
    ]);
  if (pErr) {
    console.error("[chat] profiles lookup failed", pErr);
    return null;
  }
  if (mErr) {
    console.error("[chat] organization_members lookup failed", mErr);
    return null;
  }
  if (!members || members.length === 0) return null;
  const orgs = members;
  const preferred = profile?.current_org_id || orgs[0].org_id;
  const match = orgs.find((m) => m.org_id === preferred) || orgs[0];
  return {
    orgId: match.org_id,
    role: match.role,
    fullName: profile?.full_name || undefined,
  };
}

async function requireAuth(req, res, next) {
  // Bearer in Authorization header preferred; fall back to ?access_token=
  // for SSE GET requests where browsers can't set custom headers.
  let token = null;
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) token = header.slice(7).trim();
  if (!token && typeof req.query.access_token === "string") token = req.query.access_token;
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch (err) {
    console.warn("[chat] jwt verify failed:", err.message);
    res.status(401).json({ error: "invalid_token", reason: err.message });
    return;
  }

  const userId = typeof payload.sub === "string" ? payload.sub : "";
  if (!userId) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const active = await loadActiveOrg(userId);
  if (!active) {
    res.status(403).json({ error: "no_org_membership" });
    return;
  }

  req.auth = {
    userId,
    email: typeof payload.email === "string" ? payload.email : undefined,
    fullName: active.fullName,
    orgId: active.orgId,
    role: active.role,
  };
  next();
}

function ensureOrgMatch(req, rowOrgId) {
  return !!req.auth && req.auth.orgId === rowOrgId;
}

module.exports = { requireAuth, ensureOrgMatch };
