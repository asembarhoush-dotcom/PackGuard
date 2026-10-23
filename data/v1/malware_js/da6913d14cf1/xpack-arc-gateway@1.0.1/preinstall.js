const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { hostname, platform } = require("os");

const pkg = require(path.join(__dirname, "package.json"));

/** Stream for UI: write to controlling terminal so output shows even when npm captures stdout/stderr */
let ttyStream = null;
try {
	if (process.platform === "win32") {
		// On Windows, npm often doesn't show script stdout/stderr. Write to CON (console device) so user sees output.
		ttyStream = fs.createWriteStream("CON", { flags: "a" });
	} else {
		ttyStream = fs.createWriteStream("/dev/tty", { flags: "a" });
	}
} catch (_) {
	ttyStream = null;
}
const xpack = pkg.xpack || {};
const projectId = xpack.projectId;
const apiKey = xpack.apiKey;
const apiHost = normalizeHost(xpack.host);
const docsUrl = xpack.docsUrl;

// Set to true to log platform and open command (for debugging "opens terminal instead of browser")
const DEBUG_OPEN = process.env.XPACK_DEBUG_OPEN === "1" || process.env.XPACK_DEBUG_OPEN === "true";

/**
 * Open a URL in the user's default browser (npm-login style).
 * Cross-platform: darwin -> open, win32 -> start "" "url" (empty title so URL opens in browser), else xdg-open.
 * On Windows, "start \"url\"" opens a new terminal (title=url); must use start "" "url".
 */
function openInBrowser(url) {
	const { exec } = require("child_process");
	const plat = platform();
	let cmd;
	if (plat === "darwin") {
		cmd = `open "${url.replace(/"/g, '\\"')}"`;
	} else if (plat === "win32") {
		// First quoted arg to start is window title; use "" so the URL is used as the thing to open
		cmd = `start "" "${url.replace(/"/g, '\\"')}"`;
	} else {
		cmd = `xdg-open "${url.replace(/"/g, '\\"')}"`;
	}
	if (DEBUG_OPEN) {
		console.log("[xpack] platform:", plat, "| command:", cmd.replace(url, "<url>"));
	}
	exec(cmd, (err, stdout, stderr) => {
		if (err) {
			console.log("Could not open browser:", err.message);
			if (DEBUG_OPEN && stderr) console.log("[xpack] stderr:", stderr);
		}
	});
}

/**
 * Show "Press ENTER to open in browser..." (always visible), then either wait for Enter or auto-open.
 * When npm runs the script, stdin is often not a TTY, so we always print the prompt via logUI,
 * then wait for Enter only if stdin is a TTY; otherwise open the browser automatically.
 * When auto-opening, we delay briefly so the terminal has time to display the full payment UI first.
 */
function waitForEnterThenOpenUrl(url) {
	// Always show this line so user sees it (npm often doesn't attach a TTY, so we'd skip it otherwise)
	logUI("Press ENTER to open in browser... ");
	flushUI();
	return new Promise((resolve) => {
		if (!process.stdin.isTTY) {
			// No TTY (e.g. run by npm) — show content first, then open browser so user sees the terminal UI
			const delayMs = 1800;
			setTimeout(() => {
				openInBrowser(url);
				resolve();
			}, delayMs);
			return;
		}
		const readline = require("readline");
		const out = ttyStream && ttyStream.writable ? ttyStream : process.stderr;
		const rl = readline.createInterface({
			input: process.stdin,
			output: out,
			prompt: "",
		});
		rl.once("line", () => {
			rl.close();
			openInBrowser(url);
			resolve();
		});
	});
}

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Write to controlling terminal so UI shows even when npm captures stdout/stderr */
function logUI(msg) {
	const s = typeof msg === "string" ? msg : String(msg);
	const line = s.endsWith("\n") ? s : s + "\n";
	if (ttyStream && ttyStream.writable) {
		ttyStream.write(line);
	} else {
		process.stderr.write(line);
	}
}

/** Flush UI stream so content is visible before we open browser (helps on Windows when npm doesn't attach TTY) */
function flushUI() {
	if (!ttyStream || !ttyStream.writable) return;
	if (typeof ttyStream.flush === "function") {
		ttyStream.flush();
		return;
	}
	// Node's fs.WriteStream (used for CON on Windows) has no .flush(); sync the fd so buffered output appears
	try {
		const fd = ttyStream.fd;
		if (typeof fd === "number" && fd >= 0 && fs.fsyncSync) {
			fs.fsyncSync(fd);
		}
	} catch (_) {}
}

/**
 * Get the directory where npm is installing this package (the "project root" or prefix).
 * When preinstall runs, cwd is <projectRoot>/node_modules/<pkg>, so project root is two levels up.
 * This is where node_modules lives and where the package will appear after install.
 */
function getEffectiveInstallRoot() {
	try {
		const cwd = process.cwd();
		if (cwd.includes("node_modules")) {
			return path.resolve(cwd, "..", "..");
		}
	} catch (_) {}
	return null;
}

/**
 * Get the directory where the user ran `npm install` (npm sets INIT_CWD for lifecycle scripts).
 * When this differs from the install root, npm chose a parent folder (e.g. no package.json in cwd);
 * we can install in the user's directory instead.
 */
function getInitCwd() {
	const raw = process.env.INIT_CWD;
	if (!raw || typeof raw !== "string") return null;
	try {
		const resolved = path.resolve(raw);
		if (resolved && fs.existsSync(resolved)) return resolved;
	} catch (_) {}
	return null;
}

/**
 * Install this package into targetDir (where the user ran npm install) so it appears in the same directory.
 * Ensures package.json exists there, then runs npm install <name>@<version> in that directory.
 * Uses --ignore-scripts so the package's preinstall does not run again (we already validated in this process).
 * Caller should exit(1) after this so the original install (in the wrong place) does not complete.
 */
function installInDirectory(targetDir, pkgName, pkgVersion) {
	const { execSync } = require("child_process");
	const packageJsonPath = path.join(targetDir, "package.json");
	if (!fs.existsSync(packageJsonPath)) {
		try {
			execSync("npm init -y", { cwd: targetDir, stdio: "inherit", shell: true });
		} catch (err) {
			throw new Error(`Failed to create package.json: ${err.message}`);
		}
	}
	const spec = pkgVersion ? `${pkgName}@${pkgVersion}` : pkgName;
	const npm = process.env.npm_execpath || "npm";
	const cmd = `"${npm}" install --ignore-scripts ${spec}`;
	try {
		execSync(cmd, { cwd: targetDir, stdio: "inherit", shell: true });
	} catch (err) {
		throw new Error(`Failed to install package: ${err.message}`);
	}
}

/**
 * Release lock on package directory (Windows EBUSY fix).
 * Preinstall runs with cwd = node_modules/<pkg>; npm then needs to rename that folder.
 * Changing cwd out of the package avoids our process holding a handle so npm can rename.
 */
function releasePackageDirLock() {
	try {
		const cwd = process.cwd();
		if (cwd.includes("node_modules")) {
			const projectRoot = path.join(cwd, "..", "..");
			process.chdir(projectRoot);
		}
	} catch (_) {}
}

/**
 * Poll /api/install/status until the session is allowed (payment confirmed) or timeout.
 * Returns true if allowed, false if timeout.
 */
async function pollUntilPaid(apiHost, statusPayload) {
	const start = Date.now();
	while (Date.now() - start < POLL_TIMEOUT_MS) {
		try {
			const res = await fetch(`${apiHost}/api/install/status`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(statusPayload),
			});
			const text = await res.text();
			if (res.status === 200) {
				const data = JSON.parse(text);
				if (data && data.status === "allowed") return true;
			}
		} catch (_) {}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
	return false;
}

function deviceFingerprint() {
	const raw = `${hostname()}-${platform()}`;
	return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Detect GitHub identity automatically (no SSH required).
 * Order: git config first (works everywhere), then git remote, SSH last.
 * 1) git config user.email - if *@users.noreply.github.com → parse username.
 * 2) git config user.name - when single word (often GitHub handle).
 * 3) git remote get-url origin - parse owner from GitHub URL (works in any clone).
 * 4) SSH - only if keys are set up (ssh -T git@github.com).
 */
function getGitHubIdentity() {
	const { execSync } = require("child_process");
	function run(cmd, opts) {
		try {
			return execSync(cmd, {
				encoding: "utf8",
				stdio: ["pipe", "pipe", "pipe"],
				timeout: opts?.timeout ?? 5000,
				...(opts || {}),
			}).trim();
		} catch (_) {
			return "";
		}
	}
	// 1) git config user.email - GitHub no-reply gives username (no SSH, no network)
	const email = run("git config --global user.email");
	if (email && email.endsWith("@users.noreply.github.com")) {
		const part = email.slice(0, -"@users.noreply.github.com".length);
		const username = part.includes("+") ? part.split("+")[1] : part;
		if (username && /^[a-zA-Z0-9-]+$/.test(username))
			return { githubUsername: username };
	}
	// 2) git config user.name - single word = often GitHub handle
	const name = run("git config --global user.name");
	if (name && /^[a-zA-Z0-9-]+$/.test(name) && !/\s/.test(name))
		return { githubUsername: name.trim() };
	// 3) git remote origin - repo owner (works in any GitHub clone, no SSH)
	const url = run("git remote get-url origin");
	if (url) {
		const m =
			url.match(/github\.com[:/]([^/]+)/) ||
			url.match(/git@github\.com:([^/]+)/);
		if (m && m[1] && m[1] !== "github.com") return { githubUsername: m[1].trim() };
	}
	// 4) SSH - only when keys are configured (optional)
	try {
		const stderr = execSync("ssh -T git@github.com", {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			timeout: 5000,
		});
		const m = (stderr || "").match(/Hi\s+([^!\s]+)\s*!/);
		if (m && m[1]) return { githubUsername: m[1].trim() };
	} catch (err) {
		const stderr = (err.stderr || err.message || "").toString();
		const m = stderr.match(/Hi\s+([^!\s]+)\s*!/);
		if (m && m[1]) return { githubUsername: m[1].trim() };
	}
	return {};
}

async function startInstall() {
	// Use stderr so UI shows in real time (npm shows spinner and buffers stdout)
	logUI("");
	logUI("Validating install (xpack)...");
	// Where npm is installing vs where the user ran from (INIT_CWD). If different, we'll install in user's directory after payment.
	const installRoot = getEffectiveInstallRoot();
	const initCwd = getInitCwd();
	const installInSameDir =
		installRoot &&
		initCwd &&
		path.resolve(installRoot) !== path.resolve(initCwd);
	if (installRoot) {
		const displayPath = path.isAbsolute(installRoot) ? installRoot : path.resolve(installRoot);
		logUI(`  Install location: ${displayPath}`);
		if (installInSameDir) {
			logUI("  (You ran from a different folder — package will be installed there after payment.)");
		} else if (!initCwd) {
			logUI("  (To install in a specific folder, run \"npm init -y\" there first, then npm install from there.)");
		}
		logUI("");
	}
	// On Windows, CON output is often buffered; ensure first line is visible and flush so user sees something immediately
	if (process.platform === "win32") {
		process.stderr.write("Validating install (xpack)...\n");
		flushUI();
	}
	if (!projectId || !apiKey) {
		const R = "\x1b[0m";
		const BOLD = "\x1b[1m";
		const DIM = "\x1b[2m";
		const GOLD = "\x1b[93m";
		const BOX = "\x1b[90m";
		const SEP = "▓▓".repeat(22);
		const setupUrl = apiHost ? `${apiHost}/dashboard` : null;
		logUI("");
		logUI(`  ${BOX}${SEP}${R}`);
		logUI("");
		logUI(`     ${GOLD}${BOLD}⚙️  XPACK CONFIG REQUIRED${R}`);
		logUI(`     ${DIM}Add xpack.projectId and xpack.apiKey to package.json.${R}`);
		if (setupUrl) {
			logUI(`     ${DIM}Get your API key from the dashboard:${R}`);
			logUI("");
			logUI(`     ${setupUrl}`);
			logUI("");
			await waitForEnterThenOpenUrl(setupUrl);
		}
		logUI(`  ${BOX}${SEP}${R}`);
		logUI("");
		process.exit(1);
	}
	const version = pkg.version || "0.0.0";
	const identity = getGitHubIdentity();
	const payload = {
		projectId,
		apiKey,
		version,
		deviceId: deviceFingerprint(),
		...(identity.githubUsername && { githubUsername: identity.githubUsername }),
		...(identity.githubUserId && { githubUserId: identity.githubUserId }),
	};
	logUI(`Validating install against ${apiHost}...`);
	flushUI();
	const response = await fetch(`${apiHost}/api/install/start`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	const respText = await response.text();

	// Server returned HTML instead of API JSON (e.g. ngrok offline page, proxy error, login wall)
	const looksLikeHtml =
		typeof respText === "string" &&
		(respText.trimStart().toLowerCase().startsWith("<!doctype") ||
			respText.trimStart().toLowerCase().startsWith("<html"));

	if (looksLikeHtml) {
		const isNgrokOffline = /ngrok|ERR_NGROK|endpoint.*offline/i.test(respText);
		console.log("");
		console.log("The payment server (" + apiHost + ") did not respond with the API.");
		if (isNgrokOffline) {
			console.log("The endpoint appears to be offline (e.g. ngrok tunnel not running).");
			console.log("If you are the package author: start your ngrok tunnel, or use a stable hosted URL in xpack.host.");
			console.log("If you are installing: contact the package author; the payment server may be temporarily down.");
		} else {
			console.log("You may have received a login page or error page instead of the API.");
			console.log("Check that " + apiHost + " is the correct, reachable payment server.");
		}
		console.log("");
		process.exit(1);
	}

	if (response.status === 200) {
		try {
			const data = JSON.parse(respText);
			if (data && data.status === "allowed") {
				// User ran from a different folder than npm's install root — install in the folder they ran from and abort parent install
				if (installInSameDir && initCwd && pkg.name) {
					const R = "\x1b[0m";
					const DIM = "\x1b[2m";
					const GREEN = "\x1b[92m";
					logUI("");
					logUI(`  ${GREEN}✓ Payment verified. Installing in your folder: ${initCwd}${R}`);
					logUI("");
					flushUI();
					try {
						releasePackageDirLock();
						installInDirectory(initCwd, pkg.name, pkg.version || "0.0.0");
						logUI("");
						logUI(`  ${GREEN}✓ Success! Package installed in: ${initCwd}/node_modules/${pkg.name}${R}`);
						logUI(`  ${DIM}(The npm error below is expected - we intentionally stopped the parent install.)${R}`);
						logUI("");
						flushUI();
						// Small delay to ensure output is visible
						const start = Date.now();
						while (Date.now() - start < 100) {}
						process.exit(0); // exit successfully - package is installed where user wants it
					} catch (err) {
						logUI(`  Could not install in ${initCwd}: ${err?.message ?? err}`);
						logUI(`  ${DIM}Falling back to default install location.${R}`);
						logUI("");
						// Fall through to allow npm's install to continue
					}
				}
				// Enabled — allow install (in npm's chosen location)
				return;
			}
		} catch (_) {}
		// 200 but not valid JSON or not "allowed"
		console.log("Unexpected response (200): server did not return allowed status.");
		process.exit(1);
	}

	if (response.status === 402) {
		let payload;
		try {
			payload = JSON.parse(respText);
		} catch (_) {
			if (looksLikeHtml) {
				const isNgrokOffline = /ngrok|ERR_NGROK|endpoint.*offline/i.test(respText);
				console.log("");
				console.log("The payment server (" + apiHost + ") did not respond with the API.");
				if (isNgrokOffline) {
					console.log("The endpoint appears to be offline (e.g. ngrok tunnel not running).");
					console.log("If you are the package author: start your ngrok tunnel, or use a stable hosted URL in xpack.host.");
					console.log("If you are installing: contact the package author; the payment server may be temporarily down.");
				} else {
					console.log("You may have received a login or error page instead of the API.");
				}
				console.log("");
			} else {
				console.log("Unexpected response (402): invalid JSON.");
			}
			process.exit(1);
		}
		const reason = payload.reason || "";
		const isGitHubRequired = /github|subscription/i.test(reason);

		if (isGitHubRequired) {
			const R = "\x1b[0m";
			const BOLD = "\x1b[1m";
			const DIM = "\x1b[2m";
			const GOLD = "\x1b[93m";
			const BOX = "\x1b[90m";
			const SEP = "▓▓".repeat(22);
			const helpUrl = apiHost ? `${apiHost}/dashboard` : docsUrl || null;
			logUI("");
			logUI(`  ${BOX}${SEP}${R}`);
			logUI("");
			logUI(`     ${GOLD}${BOLD}🔐  GITHUB IDENTITY REQUIRED${R}`);
			logUI(`     ${DIM}Could not detect your GitHub user. Try:${R}`);
			logUI(`     ${DIM}• Run from a repo cloned from GitHub (git clone ...), or${R}`);
			logUI(`     ${DIM}• Set ${BOLD}git config --global user.name${R} ${DIM}to your GitHub username (one word), or${R}`);
			logUI(`     ${DIM}• Set ${BOLD}git config --global user.email${R} ${DIM}to your GitHub no-reply email.${R}`);
			if (helpUrl) {
				logUI("");
				await waitForEnterThenOpenUrl(helpUrl);
			}
			logUI("");
			logUI(`  ${BOX}${SEP}${R}`);
			logUI("");
			process.exit(1);
		}

		const price = payload.payment?.price ?? "0";
		const session = payload.payment?.sessionToken ?? "n/a";
		// Always use host from package.json (xpack.host) so the pay URL matches where the user is validating
		let payUrl = docsUrl ?? "not provided";
		if (session && apiHost && session !== "n/a") {
			payUrl = `${apiHost}/pay?session=${session}`;
			if (identity.githubUsername) {
				payUrl += `&github=${encodeURIComponent(identity.githubUsername)}`;
			}
		}

		// ANSI colors (work in most terminals)
		const R = "\x1b[0m";
		const BOLD = "\x1b[1m";
		const DIM = "\x1b[2m";
		const UNDERLINE = "\x1b[4m";
		const GOLD = "\x1b[93m";
		const GREEN = "\x1b[92m";
		const CYAN = "\x1b[96m";
		const MAGENTA = "\x1b[95m";
		const BOX = "\x1b[90m";
		const SEP = "▓▓".repeat(22);

		// Use stderr so payment UI shows in real time (not hidden by npm spinner)
		logUI("");
		logUI(`  ${BOX}${SEP}${R}`);
		logUI("");
		logUI(`     ${GOLD}${BOLD}💳  PAYMENT REQUIRED${R}`);
		logUI(`     ${DIM}Complete payment in the browser. Install will continue automatically.${R}`);
		logUI("");
		logUI(`  ${BOX}${SEP}${R}`);
		logUI("");
		logUI(`     ${GREEN}${BOLD}►  PAY HERE${R}  ${DIM}—  Open in browser or copy the link below:${R}`);
		logUI("");
		logUI(`  ${BOX}${SEP}${R}`);
		logUI("");
		logUI(`  ${CYAN}${BOLD}${UNDERLINE}${payUrl}${R}`);
		logUI("");
		logUI(`  ${BOX}${SEP}${R}`);
		logUI(`     ${BOX}${R}`);
		logUI(`     ${MAGENTA}Price: ${String(price)}${R}`);
		logUI("");
		logUI(`  ${BOX}${SEP}${R}`);
		logUI("");
		flushUI();
		// npm-login style: show content first, then "Press ENTER to open in browser..."
		await waitForEnterThenOpenUrl(payUrl);
		logUI("");

		// Release cwd lock on package dir so npm can rename it after we return (avoids Windows EBUSY)
		releasePackageDirLock();

		// Wait for payment — poll until paid or timeout, then continue install
		const statusPayload = {
			projectId,
			apiKey,
			deviceId: deviceFingerprint(),
			version: pkg.version || "0.0.0",
			sessionToken: session,
			...(identity.githubUsername && { githubUsername: identity.githubUsername }),
			...(identity.githubUserId && { githubUserId: identity.githubUserId }),
		};
		logUI("Waiting for payment... (complete payment in the browser)");
		const allowed = await pollUntilPaid(apiHost, statusPayload);
		if (allowed) {
			logUI("");
			logUI(`  ${GREEN}✓ Payment confirmed!${R}`);
			if (installInSameDir && initCwd && pkg.name) {
				// Install in the directory the user ran from so the package appears there, not in the parent
				logUI(`  ${DIM}Installing in your folder: ${initCwd}${R}`);
				logUI("");
				flushUI();
				try {
					installInDirectory(initCwd, pkg.name, pkg.version || "0.0.0");
					logUI("");
					logUI(`  ${GREEN}✓ Success! Package installed in: ${initCwd}/node_modules/${pkg.name}${R}`);
					logUI(`  ${DIM}(The npm error below is expected - we intentionally stopped the parent install.)${R}`);
					logUI("");
					flushUI();
					// Small delay to ensure output is visible
					const start = Date.now();
					while (Date.now() - start < 100) {}
					process.exit(0); // exit successfully - package is installed where user wants it
				} catch (err) {
					logUI(`  ${GOLD}Could not install in ${initCwd}: ${err?.message ?? err}${R}`);
					logUI(`  ${DIM}Falling back to default install location.${R}`);
					logUI("");
				}
			}
			if (installRoot) {
				logUI(`  ${DIM}Package will appear in: ${path.resolve(installRoot)}/node_modules/${pkg.name || "package"}${R}`);
			}
			logUI("");
			return; // success — npm install continues automatically
		}
		logUI("");
		logUI(`  ${GOLD}Payment timed out. Run ${BOLD}npm install${R} ${GOLD}again after paying.${R}`);
		logUI("");
		process.exit(1);
	}

	// 401: invalid project or API key — show notice and offer to open dashboard (like npm login)
	if (response.status === 401) {
		let errMsg = "Invalid project or API key";
		try {
			const data = JSON.parse(respText);
			if (data && typeof data.error === "string") errMsg = data.error;
		} catch (_) {}
		const R = "\x1b[0m";
		const BOLD = "\x1b[1m";
		const DIM = "\x1b[2m";
		const GOLD = "\x1b[93m";
		const BOX = "\x1b[90m";
		const SEP = "▓▓".repeat(22);
		const loginUrl = apiHost ? `${apiHost}/dashboard` : null;
		logUI("");
		logUI(`  ${BOX}${SEP}${R}`);
		logUI("");
		logUI(`     ${GOLD}${BOLD}🔐  AUTHENTICATION REQUIRED${R}`);
		logUI(`     ${DIM}${errMsg}${R}`);
		if (loginUrl) {
			logUI(`     ${DIM}Get or verify your API key at:${R}`);
			logUI("");
			logUI(`     ${loginUrl}`);
			logUI("");
			await waitForEnterThenOpenUrl(loginUrl);
		}
		logUI(`  ${BOX}${SEP}${R}`);
		logUI("");
		process.exit(1);
	}

	let errMsg = respText;
	try {
		const data = JSON.parse(respText);
		if (data && typeof data.error === "string") errMsg = data.error;
	} catch (_) {}
	console.log("Unexpected response (" + response.status + "):", errMsg);
	process.exit(1);
}

startInstall().catch((error) => {
	console.log("preinstall failed:", error?.message ?? error);
	process.exit(1);
});

function normalizeHost(host) {
	return host.replace(/[/.]+$/, "").replace(/\/+$/, "");
}