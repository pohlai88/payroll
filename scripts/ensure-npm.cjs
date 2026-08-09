"use strict";

const userAgent = process.env.npm_config_user_agent || "";
const execPath = (process.env.npm_execpath || "").replace(/\\/g, "/");

const usingPnpm = /\bpnpm\b/i.test(userAgent) || /\/pnpm\//i.test(execPath);
const usingYarn = /\byarn\b/i.test(userAgent) || /\/yarn\//i.test(execPath);
const usingNpm =
  /\bnpm\b/i.test(userAgent) || /\/npm\/|npm-cli\.js$/i.test(execPath);

if (usingPnpm || usingYarn || !usingNpm) {
  console.error(
    [
      "This project uses npm only.",
      "pnpm and yarn are blocked.",
      "",
      "Use:",
      "  npm install",
      "  npm ci",
    ].join("\n"),
  );
  process.exit(1);
}
