/**
 * Yuno Order Form contract draft generator.
 *
 * Copies a Google Docs template into a target Drive folder and runs
 * replaceAllText for each {{VAR}} placeholder. Pricing and client fields
 * can be pre-filled from a recent business case (presentations table);
 * remaining fields come from overrides passed by the caller.
 *
 * Required env:
 *   CONTRACT_TEMPLATE_DOC_ID    Google Doc (native) id of the template
 *   CONTRACT_OUTPUT_FOLDER_ID   Drive folder id where copies land
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (for presentations lookup)
 */

const { createClient } = require("@supabase/supabase-js");

const SB_URL = process.env.SUPABASE_URL || "https://arupeqczrxmfkcbjwyad.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Yuno standard pricing from the Order Form — used when the BC or caller
// doesn't override them. Matches the fixed values shown in the PDF template.
const DEFAULT_VARS = {
  TX_FEE_FRAUD: "USD 0.01 per successful transaction",
  TX_FEE_3DS: "USD 0.025 per successful transaction",
  MIN_MONTHLY_GUARANTEE: "USD 200",
  MIN_TX_COUNT: "5,000",
  SUBSCRIPTION_TERM: "12 months",
  AUTHORIZED_USERS: "10",
};

// Variables that must be present before we create the copy. If any is missing
// we return them to the caller so Chief can ask the user via WhatsApp.
const REQUIRED_VARS = [
  "COMPANY_NAME",
  "COUNTRY",
  "REGISTRATION_NUMBER",
  "COMPANY_ADDRESS",
  "EFFECTIVE_DATE",
  "TERRITORY",
  "INTEGRATION_TYPE",
  "MONTHLY_PLATFORM_FEE",
  "TX_FEE_PAYMENT",
  "PRIMARY_CONTACT",
  "TECHNICAL_CONTACT",
  "BILLING_CONTACT",
];

function formatUSD(n) {
  if (!Number.isFinite(n)) return null;
  if (n >= 1) return `USD ${Number(n).toLocaleString("en-US")}`;
  return `USD ${Number(n).toFixed(2)}`;
}

function varsFromBC(defaults) {
  const out = {};
  if (!defaults || typeof defaults !== "object") return out;

  if (typeof defaults.clientName === "string" && defaults.clientName.trim()) {
    out.COMPANY_NAME = defaults.clientName.trim();
  }

  if (Array.isArray(defaults.countries) && defaults.countries.length > 0) {
    const names = defaults.countries
      .map((c) => (c && typeof c.name === "string" ? c.name.trim() : ""))
      .filter(Boolean);
    if (names.length > 0) {
      out.TERRITORY = names.join(", ");
      out.COUNTRY = names[0];
    }
  }

  if (Number.isFinite(defaults.monthlySaaS) && defaults.monthlySaaS > 0) {
    out.MONTHLY_PLATFORM_FEE = formatUSD(defaults.monthlySaaS);
  }

  if (Number.isFinite(defaults.ratePerTx) && defaults.ratePerTx > 0) {
    out.TX_FEE_PAYMENT = `USD ${Number(defaults.ratePerTx).toFixed(2)} per successful transaction`;
  }

  if (Number.isFinite(defaults.minTxAnnual) && defaults.minTxAnnual > 0) {
    const monthly = Math.round(defaults.minTxAnnual / 12);
    out.MIN_TX_COUNT = monthly.toLocaleString("en-US");
  }

  return out;
}

async function fetchBC({ bcSlug, clientName, orgId }) {
  if (!SB_KEY) return null;
  const sb = createClient(SB_URL, SB_KEY);

  if (bcSlug) {
    const { data, error } = await sb
      .from("presentations")
      .select("slug, client_name, defaults, created_at")
      .eq("slug", bcSlug)
      .eq("archived", false)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  }

  if (clientName && orgId) {
    const { data, error } = await sb
      .from("presentations")
      .select("slug, client_name, defaults, created_at")
      .eq("org_id", orgId)
      .ilike("client_name", clientName)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data[0];
  }

  return null;
}

async function driveCopy({ templateId, name, folderId, accessToken }) {
  const body = { name };
  if (folderId) body.parents = [folderId];
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${templateId}/copy?supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`drive.files.copy ${res.status}: ${txt.substring(0, 400)}`);
  }
  return res.json();
}

async function docsBatchReplace({ docId, vars, accessToken }) {
  const requests = Object.entries(vars).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: true },
      replaceText: String(value ?? ""),
    },
  }));
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`docs.batchUpdate ${res.status}: ${txt.substring(0, 400)}`);
  }
  return res.json();
}

async function generateContract({ orgId, clientName, bcSlug, overrides, accessToken }) {
  const templateId = process.env.CONTRACT_TEMPLATE_DOC_ID;
  const folderId = process.env.CONTRACT_OUTPUT_FOLDER_ID || null;
  if (!templateId) throw new Error("CONTRACT_TEMPLATE_DOC_ID not configured");
  if (!accessToken) throw new Error("Missing Google access token");

  const bc = await fetchBC({ bcSlug, clientName, orgId });
  const bcVars = bc ? varsFromBC(bc.defaults || {}) : {};

  const vars = { ...DEFAULT_VARS, ...bcVars, ...(overrides || {}) };

  if (!vars.COMPANY_NAME && clientName) vars.COMPANY_NAME = clientName;
  if (!vars.SIGNATURE_DATE && vars.EFFECTIVE_DATE) vars.SIGNATURE_DATE = vars.EFFECTIVE_DATE;

  const missing = REQUIRED_VARS.filter((k) => {
    const v = vars[k];
    return v == null || String(v).trim() === "";
  });
  if (missing.length > 0) {
    return {
      success: false,
      missing,
      used_bc_slug: bc ? bc.slug : null,
      message: `Missing required fields: ${missing.join(", ")}`,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const copyName = `Yuno Order Form - ${vars.COMPANY_NAME} - ${today}`;

  const copied = await driveCopy({ templateId, name: copyName, folderId, accessToken });
  const docId = copied.id;
  if (!docId) throw new Error("drive.files.copy returned no id");

  await docsBatchReplace({ docId, vars, accessToken });

  return {
    success: true,
    docId,
    url: `https://docs.google.com/document/d/${docId}/edit`,
    used_bc_slug: bc ? bc.slug : null,
    vars_applied: Object.keys(vars).sort(),
  };
}

module.exports = { generateContract, REQUIRED_VARS, DEFAULT_VARS };
