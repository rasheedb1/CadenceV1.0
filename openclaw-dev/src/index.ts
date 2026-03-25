import express from "express";
import { config, validateConfig } from "./config";
import { createRouter } from "./bot";

validateConfig();

const app = express();

// Twilio sends form-encoded POSTs
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health
app.get("/health", (_, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
app.get("/", (_, res) => {
  res.json({ service: "chief-dev-bot", status: "running" });
});

// WhatsApp webhooks
app.use(createRouter());

app.listen(config.port, () => {
  console.log(`[bot] Chief Dev Bot (WhatsApp) listening on port ${config.port}`);
  console.log(`[bot] Allowed numbers: ${config.allowedNumbers.join(", ")}`);
  console.log(`[bot] Default model: ${config.defaultModel}`);
});

const shutdown = () => {
  console.log("[bot] Shutting down...");
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
