import express from "express";
import { config, validateConfig } from "./config";
import { createBot } from "./bot";

// Validate env vars
validateConfig();

// Health server (Railway needs this)
const app = express();
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

app.listen(config.port, () => {
  console.log(`[health] Listening on port ${config.port}`);
});

// Start Telegram bot
const bot = createBot();
bot.start({
  onStart: () => {
    console.log("[bot] Chief Dev Bot is running");
    console.log(`[bot] Allowed chat IDs: ${config.allowedChatIds.join(", ")}`);
    console.log(`[bot] Default model: ${config.defaultModel}`);
  },
});

// Graceful shutdown
const shutdown = async () => {
  console.log("[bot] Shutting down...");
  bot.stop();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
