#!/usr/bin/env node
/* eslint-disable */
/**
 * Solpack preinstall script — paid-package gate for Solana.
 *
 * RESPONSIBLE DEPLOYMENT
 * ----------------------
 * Use this ONLY in packages that are clearly labeled as paid:
 *   - the package name should make this obvious (e.g. a `-paid` suffix)
 *   - the README should open with "PAID PACKAGE — costs X USDC"
 *   - the registry description should also say "(paid)"
 *
 * The script's job is to surface the cost up front, give the user a clear
 * refusal path (Ctrl-C), and only proceed when payment is verified on-chain.
 * Do not modify it to suppress the cost notice.
 *
 * Flow (matches solpack's install API):
 *   1. POST /api/install/start    → { status: "payment_required", payment }
 *   2. open payment.instructions in browser
 *   3. POST /api/install/status   loop until { status: "allowed" }
 *   4. POST /api/install/confirm  → { status: "allowed" }
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const CONFIG_KEY = "solpack";
const POLL_MS = 4000;
const TIMEOUT_MS = 15 * 60 * 1000;

function readPackageJson() {
  const pkgPath = path.join(process.cwd(), "package.json");
  return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
}

function readConfig(pkg) {
  const cfg = pkg[CONFIG_KEY];
  if (!cfg || !cfg.projectId || !cfg.apiKey || !cfg.baseUrl) {
    throw new Error(
      `[solpack] Missing "${CONFIG_KEY}" config in package.json. Expected { projectId, apiKey, baseUrl }.`,
    );
  }
  return cfg;
}

function openInBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawnSync(cmd, [url], { stdio: "ignore", detached: true });
  } catch {
    /* user can copy URL manually */
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { ok: res.ok, status: res.status, json };
}

function showPaidNotice(pkgName, payment) {
  const line = (s) => `│ ${s.slice(0, 60).padEnd(60)}│`;
  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│ PAID PACKAGE                                                │");
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(line(`Package: ${pkgName}`));
  console.log(line(`Price:   ${payment.price} ${payment.currency} on Solana`));
  console.log(line(`Pay to:  ${payment.address}`));
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log("│ Press Ctrl-C now to refuse. Install will not proceed         │");
  console.log("│ without an on-chain payment confirmed via Solana RPC.        │");
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("[solpack] Pay here:", payment.instructions);
}

async function main() {
  if (process.env.SOLPACK_SKIP === "1") {
    console.log("[solpack] SOLPACK_SKIP=1 set, skipping payment check.");
    return;
  }

  const pkg = readPackageJson();
  const cfg = readConfig(pkg);

  // 1. start
  const start = await postJson(`${cfg.baseUrl}/api/install/start`, {
    projectId: cfg.projectId,
    apiKey: cfg.apiKey,
    deviceId: process.env.SOLPACK_DEVICE_ID,
    version: pkg.version || "0.0.0",
  });

  if (start.status === 401) {
    throw new Error(`[solpack] ${start.json.error || "Unauthorised"}`);
  }
  if (start.json && start.json.status === "allowed") {
    console.log("[solpack] Already authorised. Continuing install.");
    return;
  }
  if (!start.json || !start.json.payment) {
    throw new Error("[solpack] Unexpected response from /api/install/start");
  }

  const { payment } = start.json;
  showPaidNotice(pkg.name, payment);

  await new Promise((r) => setTimeout(r, 3000));
  openInBrowser(payment.instructions);

  // 2. poll status
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const s = await postJson(`${cfg.baseUrl}/api/install/status`, {
      projectId: cfg.projectId,
      apiKey: cfg.apiKey,
      sessionToken: payment.sessionToken,
    });
    if (s.status === 401) {
      throw new Error(`[solpack] ${s.json.error || "Unauthorised"}`);
    }
    if (s.json && s.json.status === "allowed") {
      // 3. confirm
      const c = await postJson(`${cfg.baseUrl}/api/install/confirm`, {
        projectId: cfg.projectId,
        apiKey: cfg.apiKey,
        sessionToken: payment.sessionToken,
      });
      if (c.json && c.json.status === "allowed") {
        console.log("\n[solpack] Payment verified on-chain. Continuing install.");
        return;
      }
      throw new Error("[solpack] Unable to confirm install");
    }
    process.stdout.write(".");
  }

  throw new Error("[solpack] Timed out waiting for payment.");
}

main().catch((err) => {
  console.error("");
  console.error(err.message || err);
  console.error(
    "[solpack] Install was not authorised. Re-run `npm install` after paying, or unset the dependency to refuse.",
  );
  process.exit(1);
});
