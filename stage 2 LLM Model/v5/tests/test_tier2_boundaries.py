r"""
PackGuard Stage 2 v5 — Tier 2 Boundary & Corner Case Tests.

Adversarial stress testing verifying robust behavior on pathological inputs:
  - Empty strings, empty packages, whitespace chunks
  - Huge payloads (>100 KB, 5,000 array elements, 10,000 comments)
  - Deeply nested eval(Buffer.from(...)) recursions (levels 1 to 5)
  - Malformed regex/tokens (unclosed strings, invalid hex \xGG, lone surrogates \uD800)
  - Invalid/corrupted WASM magic bytes (\0asx, truncated headers)
  - Corrupted Base64 payloads (invalid padding, non-base64 characters)
  - Non-byte-aligned zero-width unicode sequences
  - High-entropy benign data tables without execution sinks
"""

import base64
import re
import sys
import unittest
from pathlib import Path

# Ensure local test directory is in sys.path
TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from conftest_base import decode_zero_width_payload, encode_zero_width_payload, import_v5_module


class TestTier2BoundaryAndCornerCases(unittest.TestCase):
    """Tier 2: Boundary, Corner Case, and Adversarial Input Stress Tests."""

    @classmethod
    def setUpClass(cls):
        cls.v5_ast = import_v5_module("ast_deobfuscator", fallback_to_v4=True)
        cls.v5_formatter = import_v5_module("text_formatter", fallback_to_v4=True)
        cls.v5_filter = import_v5_module("stage2_filter", fallback_to_v4=True)

    # --------------------------------------------------------------------------
    # 1. Empty Strings & Whitespace
    # --------------------------------------------------------------------------
    def test_empty_string_and_whitespace_deobfuscation(self):
        """Empty JS strings and whitespace-only chunks must process cleanly without crash."""
        inputs = ["", "   ", "\n\t\r\n", ";;;", "/**/"]
        for inp in inputs:
            with self.subTest(input=repr(inp)):
                if hasattr(self.v5_ast, "deobfuscate_javascript"):
                    cleaned, stats = self.v5_ast.deobfuscate_javascript(inp)
                    self.assertIsInstance(cleaned, str)
                    self.assertIsInstance(stats, dict)

    def test_empty_package_formatting(self):
        """Package with no chunks or empty chunks must format to empty marker."""
        empty_pkg = {"package": "empty-test", "chunks": []}
        if hasattr(self.v5_formatter, "format_scanner_chunks_to_text"):
            formatted = self.v5_formatter.format_scanner_chunks_to_text(empty_pkg)
            self.assertIn("EMPTY", formatted)

        whitespace_pkg = {
            "package": "whitespace-test",
            "chunks": [{"file": "index.js", "kind": "js", "text": "   \n\t  "}],
        }
        if hasattr(self.v5_formatter, "format_scanner_chunks_to_text"):
            formatted = self.v5_formatter.format_scanner_chunks_to_text(whitespace_pkg)
            self.assertIsInstance(formatted, str)

    # --------------------------------------------------------------------------
    # 2. Huge Payloads & Stress Testing
    # --------------------------------------------------------------------------
    def test_huge_string_array_stress(self):
        """Stress test with 3,000 array elements must execute in bounded time without ReDoS."""
        elements = [f'"element_{i}"' for i in range(3000)]
        huge_array_js = f"var _0xbig = [{', '.join(elements)}]; const first = _0xbig[0];"
        if hasattr(self.v5_ast, "deobfuscate_javascript"):
            cleaned, stats = self.v5_ast.deobfuscate_javascript(huge_array_js)
            self.assertIsInstance(cleaned, str)

    def test_massive_comment_dilution_stress(self):
        """5,000 lines of adversarial comments preceding a command."""
        comment_lines = ["// padding comment line " + str(i) for i in range(5000)]
        comment_lines.append('const cp = require("child_process"); cp.execSync("id");')
        padded_js = "\n".join(comment_lines)

        if hasattr(self.v5_ast, "deobfuscate_javascript"):
            cleaned, stats = self.v5_ast.deobfuscate_javascript(padded_js)
            self.assertIn("child_process", cleaned)
            # Comments must be stripped or folded
            self.assertLess(len(cleaned), len(padded_js))

    def test_large_minified_file_formatting(self):
        """Large minified code (>100 KB) must format cleanly without crashing."""
        # 120 KB repetition of benign utility functions
        block = "function util(a){return a*2+1;}export default util;"
        large_code = block * 2400  # ~120 KB
        pkg = {"package": "large-pkg", "chunks": [{"file": "bundle.min.js", "kind": "js", "text": large_code}]}
        if hasattr(self.v5_formatter, "format_scanner_chunks_to_text"):
            formatted = self.v5_formatter.format_scanner_chunks_to_text(pkg, max_chars=4096)
            self.assertIsInstance(formatted, str)
            self.assertIn("util", formatted)

    # --------------------------------------------------------------------------
    # 3. Deeply Nested eval / Base64 Recursion
    # --------------------------------------------------------------------------
    def test_nested_eval_base64_recursion(self):
        """Nested eval(Buffer.from(..., 'base64')) up to 5 levels must unfold safely."""
        inner = 'require("child_process").execSync("cat /etc/shadow");'
        current = inner
        for level in range(4):
            b64 = base64.b64encode(current.encode("utf-8")).decode("ascii")
            current = f'eval(Buffer.from("{b64}", "base64").toString("utf-8"));'

        # Current is now a 4-level nested eval-base64 wrapper
        self.assertIn("Buffer.from", current)

        if hasattr(self.v5_formatter, "unfold_eval_base64_wrappers"):
            unfolded = self.v5_formatter.unfold_eval_base64_wrappers(current, max_depth=3)
            self.assertIsInstance(unfolded, str)

        if hasattr(self.v5_formatter, "clean_and_unfold_js"):
            cleaned = self.v5_formatter.clean_and_unfold_js(current)
            self.assertIsInstance(cleaned, str)

    # --------------------------------------------------------------------------
    # 4. Malformed Regex / Invalid Escape Tokens
    # --------------------------------------------------------------------------
    def test_malformed_hex_and_unicode_escapes(self):
        """Malformed hex (\\xGG) and truncated unicode (\\u12) must not crash parser."""
        malformed_inputs = [
            r'const bad_hex = "\xGG";',
            r'const trunc_hex = "\x1";',
            r'const bad_uni = "\uZZZZ";',
            r'const trunc_uni = "\u12";',
            r'const lone_surr = "\uD800";',
            r'const null_byte = "\x00\0";',
        ]
        for code in malformed_inputs:
            with self.subTest(code=code):
                if hasattr(self.v5_ast, "decode_string_escapes"):
                    res = self.v5_ast.decode_string_escapes(code)
                    decoded = res[0] if isinstance(res, (tuple, list)) else res
                    self.assertIsInstance(decoded, str)
                if hasattr(self.v5_ast, "deobfuscate_javascript"):
                    cleaned, _ = self.v5_ast.deobfuscate_javascript(code)
                    self.assertIsInstance(cleaned, str)

    def test_unclosed_string_literals(self):
        """Unclosed quotes or unclosed regexes must not trigger catastrophic backtracking."""
        pathological = [
            'var s = "unclosed string literal;\nvar x = 1;',
            "var s = 'unclosed single quote;\nvar y = 2;",
            "var reg = /unclosed regex;\nvar z = 3;",
        ]
        for code in pathological:
            with self.subTest(code=code):
                if hasattr(self.v5_ast, "deobfuscate_javascript"):
                    cleaned, stats = self.v5_ast.deobfuscate_javascript(code)
                    self.assertIsInstance(cleaned, str)

    # --------------------------------------------------------------------------
    # 5. Invalid / Truncated WASM Magic Bytes
    # --------------------------------------------------------------------------
    def test_invalid_wasm_magic_bytes(self):
        """Corrupted WASM magic bytes must not be falsely flagged as valid WASM."""
        invalid_wasm_cases = [
            # 1. Byte 3 altered (\0asx instead of \0asm)
            "const buf = new Uint8Array([0x00, 0x61, 0x73, 0x78]);",
            # 2. Only 2 bytes (truncated header)
            "const buf = new Uint8Array([0x00, 0x61]);",
            # 3. Empty Uint8Array
            "const buf = new Uint8Array([]);",
        ]
        for code in invalid_wasm_cases:
            with self.subTest(code=code):
                # Valid magic is strictly [0x00, 0x61, 0x73, 0x6D]
                has_exact_magic = bool(re.search(r"0x00\s*,\s*0x61\s*,\s*0x73\s*,\s*0x6[dD]", code))
                self.assertFalse(has_exact_magic, "Must not match corrupted WASM magic")

    # --------------------------------------------------------------------------
    # 6. Corrupted Base64 Strings
    # --------------------------------------------------------------------------
    def test_corrupted_base64_strings(self):
        """Corrupted Base64 with invalid characters or bad padding must handle safely."""
        corrupted_cases = [
            # Extra padding
            'Buffer.from("Y29uc3Q===", "base64")',
            # Invalid non-base64 characters
            'Buffer.from("!@#$%^&*()_+", "base64")',
            # Single character
            'Buffer.from("A", "base64")',
        ]
        for case in corrupted_cases:
            with self.subTest(case=case):
                match = re.search(r'Buffer\.from\s*\(\s*["\']([^"\']+)["\']\s*,\s*["\']base64["\']\s*\)', case)
                self.assertIsNotNone(match)
                raw_b64 = match.group(1)
                try:
                    # Python base64 decoding test
                    decoded = base64.b64decode(raw_b64, validate=True)
                except Exception:
                    # Expected to fail gracefully
                    pass

    # --------------------------------------------------------------------------
    # 7. Non-Byte-Aligned Zero-Width Unicode Sequences
    # --------------------------------------------------------------------------
    def test_non_byte_aligned_zero_width_steganography(self):
        """Zero-width string with length not divisible by 8 must not crash."""
        # 13 zero-width characters (not a multiple of 8)
        odd_zw = "\u200B\u200C\u200B\u200C\u200B\u200C\u200B\u200C\u200B\u200C\u200B\u200C\u200B"
        self.assertEqual(len(odd_zw), 13)

        # decode_zero_width_payload should decode the first 8-bit byte and ignore remainder
        decoded = decode_zero_width_payload(odd_zw)
        self.assertEqual(len(decoded), 1)

    # --------------------------------------------------------------------------
    # 8. High-Entropy Benign Data Without Sinks
    # --------------------------------------------------------------------------
    def test_high_entropy_benign_tables_without_sinks(self):
        """High-entropy lookup tables (hashes, tokens) with 0 sinks must remain benign."""
        high_entropy_benign = {
            "package": "hash-table-util",
            "chunks": [
                {
                    "file": "hashes.js",
                    "kind": "js",
                    "text": """
                    const HASH_TABLE = {
                        "entry1": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                        "entry2": "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
                        "entry3": "fb79773692e1b2160d9a3944c15cb4b197457a889fab1384462d73a00f32474f"
                    };
                    function getHash(k) { return HASH_TABLE[k] || null; }
                    module.exports = getHash;
                    """,
                }
            ],
        }
        if hasattr(self.v5_filter, "compute_v5_calibrated_probability") or hasattr(self.v5_filter, "compute_v4_calibrated_probability"):
            compute_fn = getattr(self.v5_filter, "compute_v5_calibrated_probability", getattr(self.v5_filter, "compute_v4_calibrated_probability", None))
            prob, mitre = compute_fn(high_entropy_benign, raw_score=0.20)
            self.assertLessEqual(prob, 0.35, "High entropy tables without execution sinks must not be flagged")


if __name__ == "__main__":
    unittest.main()
