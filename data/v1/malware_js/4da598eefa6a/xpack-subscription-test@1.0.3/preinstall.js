const crypto = require("crypto");
const path = require("path");
const { hostname, platform } = require("os");

const pkg = require(path.join(__dirname, "package.json"));
const xpack = pkg.xpack || {};
const projectId = xpack.projectId;
const apiKey = xpack.apiKey;
const apiHost = normalizeHost(xpack.host);
const docsUrl = xpack.docsUrl;

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
	if (!projectId || !apiKey) {
		console.error(
			"Missing xpack config. Add xpack.projectId and xpack.apiKey to package.json.",
		);
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
	console.log(`Validating install against ${apiHost}.`);
	const response = await fetch(`${apiHost}/api/install/start`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	const respText = await response.text();
	if (response.status === 200) {
		try {
			const data = JSON.parse(respText);
			if (data && data.status === "allowed") {
				// Enabled — allow install
				return;
			}
		} catch (_) {}
		// 200 but not valid JSON or not "allowed" (e.g. ngrok HTML)
		console.error("Unexpected response (200): server did not return allowed status.");
		process.exit(1);
	}

	if (response.status === 402) {
		let payload;
		try {
			payload = JSON.parse(respText);
		} catch (_) {
			console.error("Unexpected response (402): invalid JSON.");
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
			console.log("");
			console.log(`  ${BOX}${SEP}${R}`);
			console.log("");
			console.log(`     ${GOLD}${BOLD}🔐  GITHUB IDENTITY REQUIRED${R}`);
			console.log(`     ${DIM}Could not detect your GitHub user. Try:${R}`);
			console.log(`     ${DIM}• Run from a repo cloned from GitHub (git clone ...), or${R}`);
			console.log(`     ${DIM}• Set ${BOLD}git config --global user.name${R} ${DIM}to your GitHub username (one word), or${R}`);
			console.log(`     ${DIM}• Set ${BOLD}git config --global user.email${R} ${DIM}to your GitHub no-reply email.${R}`);
			console.log("");
			console.log(`  ${BOX}${SEP}${R}`);
			console.log("");
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

		// Use stdout so npm shows this as notice/info, not "npm error"
		console.log("");
		console.log(`  ${BOX}${SEP}${R}`);
		console.log("");
		console.log(`     ${GOLD}${BOLD}💳  PAYMENT REQUIRED${R}`);
		console.log(`     ${DIM}Pay below to unlock this package.${R}`);
		console.log("");
		console.log(`  ${BOX}${SEP}${R}`);
		console.log("");
		console.log(`     ${GREEN}${BOLD}►  PAY HERE${R}  ${DIM}—  Open in browser or copy this link:${R}`);
		console.log("");
		console.log(`  ${BOX}${SEP}${R}`);
		console.log("");
		console.log(`  ${CYAN}${BOLD}${UNDERLINE}${payUrl}${R}`);
		console.log("");
		console.log(`  ${DIM}↑ Copy the full URL above (one line). If it wrapped, paste both parts together.${R}`);
		console.log("");
		console.log(`  ${BOX}${SEP}${R}`);
		console.log(`     ${BOX}${R}`);
		console.log(`     ${MAGENTA}Price: ${String(price)}${R}`);
		console.log(`     After payment, run:  ${BOLD}npm install${R}`);
		console.log("");
		console.log(`  ${BOX}${SEP}${R}`);
		console.log("");
		process.exit(1);
	}

	let errMsg = respText;
	try {
		const data = JSON.parse(respText);
		if (data && typeof data.error === "string") errMsg = data.error;
	} catch (_) {}
	console.error("Unexpected response (" + response.status + "):", errMsg);
	process.exit(1);
}

startInstall().catch((error) => {
	console.error("preinstall failed:", error);
	process.exit(1);
});

function normalizeHost(host) {
	return host.replace(/[/.]+$/, "").replace(/\/+$/, "");
}
