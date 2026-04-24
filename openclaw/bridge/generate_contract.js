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
// TX_FEE_PAYMENT lives in a separate list because the caller can satisfy it
// either via a flat string OR via structured pricing rows — see generateContract.
const REQUIRED_VARS = [
  "COMPANY_NAME",
  "COUNTRY",
  "REGISTRATION_NUMBER",
  "COMPANY_ADDRESS",
  "EFFECTIVE_DATE",
  "TERRITORY",
  "INTEGRATION_TYPE",
  "MONTHLY_PLATFORM_FEE",
  "PRIMARY_CONTACT",
  "TECHNICAL_CONTACT",
  "BILLING_CONTACT",
];

function formatUSD(n) {
  if (!Number.isFinite(n)) return null;
  if (n >= 1) return `USD ${Number(n).toLocaleString("en-US")}`;
  return `USD ${Number(n).toFixed(2)}`;
}

// European-style thousands separator for volume column (matches screenshot:
// "50.000", "100.000"). We use a manual replace instead of toLocaleString("de-DE")
// because Node's ICU build may or may not have German; manual is portable.
function fmtVolume(n) {
  return Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Turns BC pricing data into rows for the Transaction Pricing table.
// Returns [] when the BC has no structured pricing; in that case generateContract
// falls back to the legacy flat-string replacement of {{TX_FEE_PAYMENT}}.
function buildPricingRows(defaults) {
  if (!defaults || typeof defaults !== "object") return [];

  const tiers = Array.isArray(defaults.rateTiers) ? defaults.rateTiers : [];
  const validTiers = tiers.filter((t) => t && Number.isFinite(t.ratePerTx));

  if (validTiers.length >= 2) {
    const rows = [];
    let prevUpTo = 0;
    validTiers.forEach((t, i) => {
      const from = i === 0 ? 0 : prevUpTo + 1;
      const to = Number.isFinite(t.upToTx) ? t.upToTx : null;
      rows.push({
        type: i === 0 ? "TRANSACTION FEES - PAYMENT" : "",
        volume: to == null
          ? `${fmtVolume(from)}+ TRANSACTIONS`
          : `${fmtVolume(from)} - ${fmtVolume(to)} TRANSACTIONS`,
        tier: `Tier ${i + 1}`,
        fee: `USD ${Number(t.ratePerTx).toFixed(3)}`,
      });
      if (to != null) prevUpTo = to;
    });
    return rows;
  }

  const flatRate = validTiers.length === 1 ? validTiers[0].ratePerTx : defaults.ratePerTx;
  if (Number.isFinite(flatRate) && flatRate > 0) {
    return [
      {
        type: "TRANSACTION FEES - PAYMENT",
        volume: "ALL TRANSACTIONS",
        tier: "Tier 1",
        fee: `USD ${Number(flatRate).toFixed(3)}`,
      },
    ];
  }

  return [];
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

  // Only set TX_FEE_PAYMENT as a flat string when the BC has a single rate and
  // no tier structure. Tiered pricing (or single-tier arrays) is handled by the
  // table-insertion path in generateContract, which consumes the placeholder
  // directly without going through replaceAllText.
  const hasTiers = Array.isArray(defaults.rateTiers)
    && defaults.rateTiers.filter((t) => t && Number.isFinite(t.ratePerTx)).length > 0;
  if (!hasTiers && Number.isFinite(defaults.ratePerTx) && defaults.ratePerTx > 0) {
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

async function docsGet({ docId, accessToken }) {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`docs.get ${res.status}: ${txt.substring(0, 400)}`);
  }
  return res.json();
}

async function docsBatchUpdate({ docId, requests, accessToken }) {
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

function findMarkerParagraph(doc, marker) {
  const content = doc?.body?.content || [];
  for (const el of content) {
    if (!el.paragraph) continue;
    const text = (el.paragraph.elements || [])
      .map((e) => e.textRun?.content || "")
      .join("");
    if (text.includes(marker)) {
      return { startIndex: el.startIndex, endIndex: el.endIndex };
    }
  }
  return null;
}

function findTableAfterIndex(doc, afterIndex) {
  const content = doc?.body?.content || [];
  for (const el of content) {
    if (!el.table) continue;
    if (typeof el.startIndex !== "number" || el.startIndex < afterIndex) continue;
    return el;
  }
  return null;
}

// Replaces the paragraph containing {{TX_FEE_PAYMENT}} with a native Google Docs
// table populated from `rows`. Three API round-trips:
//   1. documents.get  — locate the marker paragraph
//   2. batchUpdate    — delete the paragraph, insert an empty table at that index
//   3. documents.get  — read back the new table's cell indices
//   4. batchUpdate    — insertText in each cell, in reverse order so earlier
//                       indices don't shift while later ones are applied
//
// Returns { inserted, rowCount, reason? }. When the marker isn't found we no-op
// and let the caller decide what to do (e.g. fall back to flat replaceAllText).
async function insertPricingTable({ docId, accessToken, rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: false, reason: "no_rows" };
  }

  const marker = "{{TX_FEE_PAYMENT}}";
  const doc1 = await docsGet({ docId, accessToken });
  const loc = findMarkerParagraph(doc1, marker);
  if (!loc) return { inserted: false, reason: "marker_not_found" };

  const numRows = rows.length + 1; // +1 for header
  const numCols = 4;

  await docsBatchUpdate({
    docId,
    accessToken,
    requests: [
      { deleteContentRange: { range: { startIndex: loc.startIndex, endIndex: loc.endIndex } } },
      { insertTable: { rows: numRows, columns: numCols, location: { index: loc.startIndex } } },
    ],
  });

  const doc2 = await docsGet({ docId, accessToken });
  const table = findTableAfterIndex(doc2, loc.startIndex);
  if (!table) throw new Error("Failed to locate newly inserted pricing table");

  const header = ["FEE TYPE", "MONTHLY TRANSACTION VOLUME", "TIER", "FEE PER TRANSACTION"];
  const grid = [header, ...rows.map((r) => [r.type, r.volume, r.tier, r.fee])];

  const tableRows = table.table?.tableRows || [];
  if (tableRows.length !== numRows) {
    throw new Error(
      `Inserted pricing table has ${tableRows.length} rows, expected ${numRows}`,
    );
  }

  // Collect insertText requests with absolute doc indices, then sort descending
  // so we apply the last cell first. Within a single batchUpdate, each request
  // sees the document state AFTER previous ones in the same batch, so inserting
  // in reverse keeps earlier indices valid.
  const inserts = [];
  for (let r = 0; r < tableRows.length; r++) {
    const cells = tableRows[r].tableCells || [];
    for (let c = 0; c < cells.length; c++) {
      const text = grid[r]?.[c];
      if (!text) continue;
      const para = (cells[c].content || []).find((el) => el.paragraph);
      if (!para || typeof para.startIndex !== "number") continue;
      // +1 skips the implicit paragraph-start position so text lands inside the
      // cell's paragraph, not in the structural cell boundary.
      inserts.push({ index: para.startIndex + 1, text });
    }
  }
  inserts.sort((a, b) => b.index - a.index);

  if (inserts.length > 0) {
    await docsBatchUpdate({
      docId,
      accessToken,
      requests: inserts.map((i) => ({
        insertText: { location: { index: i.index }, text: i.text },
      })),
    });
  }

  return { inserted: true, rowCount: rows.length };
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

  // Build structured pricing rows from the BC. When the caller provides
  // `overrides.TX_FEE_PAYMENT` as a flat string we honor it via the legacy
  // replaceAllText path and skip table insertion entirely — this is the "I just
  // want a single-line flat rate" escape hatch.
  const overrideFlat = overrides && typeof overrides.TX_FEE_PAYMENT === "string"
    && overrides.TX_FEE_PAYMENT.trim() !== "";
  const pricingRows = overrideFlat ? [] : buildPricingRows(bc ? bc.defaults : null);

  const missing = REQUIRED_VARS.filter((k) => {
    const v = vars[k];
    return v == null || String(v).trim() === "";
  });
  if (pricingRows.length === 0 && !overrideFlat) {
    missing.push("TX_FEE_PAYMENT");
  }
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

  // Replace the {{TX_FEE_PAYMENT}} placeholder (still intact in the copy since
  // `vars` didn't include it when we have pricingRows) with a native table.
  let tableResult = { inserted: false, reason: "not_attempted" };
  if (pricingRows.length > 0) {
    tableResult = await insertPricingTable({ docId, accessToken, rows: pricingRows });
    if (!tableResult.inserted) {
      console.warn(
        `[contract] pricing table not inserted (${tableResult.reason}); marker may still be visible in doc ${docId}`,
      );
    }
  }

  return {
    success: true,
    docId,
    url: `https://docs.google.com/document/d/${docId}/edit`,
    used_bc_slug: bc ? bc.slug : null,
    vars_applied: Object.keys(vars).sort(),
    pricing_table: {
      mode: overrideFlat ? "flat_override" : pricingRows.length > 1 ? "tiered" : pricingRows.length === 1 ? "flat_single" : "none",
      rows: pricingRows.length,
      inserted: tableResult.inserted,
      reason: tableResult.reason || null,
    },
  };
}

module.exports = { generateContract, REQUIRED_VARS, DEFAULT_VARS, buildPricingRows };
