"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const bot_1 = require("./bot");
(0, config_1.validateConfig)();
const app = (0, express_1.default)();
// Twilio sends form-encoded POSTs
app.use(express_1.default.urlencoded({ extended: false }));
app.use(express_1.default.json());
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
app.use((0, bot_1.createRouter)());
app.listen(config_1.config.port, () => {
    console.log(`[bot] Chief Dev Bot (WhatsApp) listening on port ${config_1.config.port}`);
    console.log(`[bot] Allowed numbers: ${config_1.config.allowedNumbers.join(", ")}`);
    console.log(`[bot] Default model: ${config_1.config.defaultModel}`);
});
const shutdown = () => {
    console.log("[bot] Shutting down...");
    process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
