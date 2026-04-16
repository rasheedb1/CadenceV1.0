/**
 * Yuno Business Case Generator — wrapper around Python template editor.
 *
 * Invokes assets/generate.py which edits the branded template.pptx
 * (17 slides with Yuno's exact design) and returns the PPTX buffer.
 *
 * Exports generateBusinessCase(config) → { buffer, summary }.
 */
const { spawn } = require("child_process");
const path = require("path");

async function generateBusinessCase(cfg) {
  const scriptPath = path.join(__dirname, "assets", "generate.py");
  // Normalize config to match Python script's expected schema
  // Python expects: countries: [{name, txnsPerMonth}], not [{country, txnPerMonth}]
  const normalized = { ...cfg };
  if (Array.isArray(cfg.countries)) {
    normalized.countries = cfg.countries.map(c => ({
      name: c.name || c.country || "?",
      txnsPerMonth: c.txnsPerMonth ?? c.txnPerMonth ?? 0,
      ticketPromedio: c.ticketPromedio,
      mdr: c.mdr,
    }));
  }
  // Map pricingType variations
  if (normalized.pricingType === "tranches") normalized.pricingType = "tramos";
  // Map tranches → tramos
  if (Array.isArray(cfg.tranches) && !cfg.tramos) {
    normalized.tramos = cfg.tranches;
  }
  // deltaAprobacion: support both explicit field and derived from aprobacionActual/aprobacionNueva
  if (normalized.deltaAprobacion == null && cfg.aprobacionActual != null && cfg.aprobacionNueva != null) {
    normalized.deltaAprobacion = cfg.aprobacionNueva - cfg.aprobacionActual;
  }
  // saasFee: if given as number, convert to string "X,XXX USD"
  if (typeof normalized.saasFee === "number") {
    normalized.saasFee = normalized.saasFee > 0 ? `${normalized.saasFee.toLocaleString("en-US")} USD` : "";
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("python3", [scriptPath, "-"], { stdio: ["pipe", "pipe", "pipe"] });
    const stdoutChunks = [];
    const stderrChunks = [];
    proc.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    proc.on("error", (err) => reject(new Error(`Python spawn error: ${err.message}`)));
    proc.on("close", (code) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        return reject(new Error(`Python exited ${code}: ${stderr.substring(0, 500)}`));
      }
      const buffer = Buffer.concat(stdoutChunks);
      if (buffer.length === 0) {
        return reject(new Error(`Python produced empty output: ${stderr.substring(0, 500)}`));
      }
      // Parse summary from stderr (last JSON line)
      let summary = { clientName: cfg.clientName, slides: 17 };
      const lines = stderr.trim().split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const parsed = JSON.parse(lines[i]);
          if (parsed.summary) { summary = parsed.summary; break; }
        } catch {}
      }
      resolve({ buffer, summary });
    });
    proc.stdin.write(JSON.stringify(normalized));
    proc.stdin.end();
  });
}

module.exports = { generateBusinessCase };
