"""
PackGuard Stage 2 v4 — AST De-obfuscator & Constant-Folding Normalizer

Performs static semantic de-obfuscation and constant folding on JavaScript code
prior to neural tokenization in ModernBERT. 

Defends against:
  1. Hex & Unicode Escapes (\\x63\\x68\\x69... -> "child_process")
  2. String Concatenation Splitting ("child_" + "process" -> "child_process")
  3. Obfuscator.io / Webpack String Array Tables (_0x1a = ['child_process']; _0x1a[0] -> "child_process")
  4. Computed Property Obfuscation (global['eval'] -> eval, process['env'] -> process.env)
  5. Adversarial Token Dilution & Comment Injection
"""

import ast
import re
from typing import Any, Dict, List, Optional, Set, Tuple

# Regex to safely match string literals in JS (double, single, backtick)
RE_STRING_LITERAL = re.compile(
    r"""(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)"""
)

# Hex and unicode escapes inside strings
RE_HEX_ESCAPE = re.compile(r"\\x([0-9a-fA-F]{2})")
RE_UNICODE_ESCAPE = re.compile(r"\\u([0-9a-fA-F]{4})")
RE_OCTAL_ESCAPE = re.compile(r"\\([0-7]{1,3})")

# String concatenation: "abc" + "def"
RE_STR_CONCAT = re.compile(
    r"""(["'])((?:(?!\1)[^\\\r\n]|\\.)*)\1\s*\+\s*(["'])((?:(?!\3)[^\\\r\n]|\\.)*)\3"""
)

# String array table declarations: var/let/const _0x12ab = [ 'str1', 'str2', ... ];
RE_STRING_ARRAY_DECL = re.compile(
    r"(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*\[([^\]]+)\]\s*;?",
    re.MULTILINE,
)

# Simple wrapper functions: function _0xabc(x) { return _0xdef[x]; }
RE_WRAPPER_FUNC = re.compile(
    r"""function\s+([A-Za-z0-9_$]+)\s*\(\s*([A-Za-z0-9_$]+)\s*\)\s*\{\s*return\s+([A-Za-z0-9_$]+)\s*\[\s*\2\s*\]\s*;\s*\}""",
    re.MULTILINE,
)

# Computed property access: obj["method"] or obj['method']
RE_COMPUTED_PROP = re.compile(
    r"""([A-Za-z0-9_$)\]])\s*\[\s*(["'])([A-Za-z_$][A-Za-z0-9_$]*)\2\s*\]"""
)

# Common global function invocations via bracket: window['eval'] -> eval
RE_GLOBAL_CALL = re.compile(
    r"""\b(?:window|global|globalThis|this)\s*\[\s*(["'])(eval|Function|require)\1\s*\]"""
)

# Comments anchored to start of line (prevents corrupting JS regex literals like /https?:\/\// or /\*/)
RE_SINGLE_LINE_COMMENT = re.compile(r"^[ \t]*//[^\r\n]*\r?\n?", re.MULTILINE)
RE_MULTI_LINE_COMMENT = re.compile(
    r"^[ \t]*/\*(?!\s*(?:reformatted|padded)\s*\*/)[\s\S]*?\*/[ \t]*\r?\n?",
    re.MULTILINE,
)

# Valid JS identifiers
RE_VALID_IDENTIFIER = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def _decode_escape_match(match: re.Match) -> str:
    """Decode a single hex or unicode escape sequence safely (skipping UTF-16 surrogates and null bytes)."""
    raw = match.group(0)
    try:
        if raw.startswith("\\x") or raw.startswith("\\u"):
            cp = int(match.group(1), 16)
        elif raw.startswith("\\"):
            cp = int(match.group(1), 8)
        else:
            return raw
        if cp == 0 or (0xD800 <= cp <= 0xDFFF):
            return raw
        return chr(cp)
    except Exception:
        return raw


def decode_string_escapes(code: str) -> Tuple[str, int]:
    """
    Decodes \\xHH, \\uHHHH, and \\OOO inside string literals.
    Leaves other escape sequences (like \\n, \\t) intact.
    """
    count = 0

    def replace_in_string(m: re.Match) -> str:
        nonlocal count
        s = m.group(0)
        quote = s[0]
        inner = s[1:-1]

        # Count occurrences
        hex_hits = len(RE_HEX_ESCAPE.findall(inner))
        uni_hits = len(RE_UNICODE_ESCAPE.findall(inner))
        oct_hits = len(RE_OCTAL_ESCAPE.findall(inner))
        hits = hex_hits + uni_hits + oct_hits
        if hits == 0:
            return s

        count += hits

        # Decode
        inner = RE_HEX_ESCAPE.sub(_decode_escape_match, inner)
        inner = RE_UNICODE_ESCAPE.sub(_decode_escape_match, inner)
        inner = RE_OCTAL_ESCAPE.sub(_decode_escape_match, inner)

        # Escape the quote character if newly decoded characters conflict
        if quote == '"':
            inner = inner.replace('"', '\\"')
        elif quote == "'":
            inner = inner.replace("'", "\\'")

        return f"{quote}{inner}{quote}"

    new_code = RE_STRING_LITERAL.sub(replace_in_string, code)
    return new_code, count


def fold_string_concatenations(code: str) -> Tuple[str, int]:
    """
    Folds adjacent string literal concatenations:
      'child_' + 'process' -> 'child_process'
      "ht" + "tp" + "s" -> "https"
    """
    count = 0
    prev = None
    curr = code

    # Loop until no more adjacent concatenations exist (e.g. 3+ segments)
    for _ in range(10):
        if prev == curr:
            break
        prev = curr

        def replacer(m: re.Match) -> str:
            nonlocal count
            q1, s1, q2, s2 = m.group(1), m.group(2), m.group(3), m.group(4)
            count += 1
            combined = s1 + s2
            # Use double quotes, escape unescaped double quotes if needed
            if q1 == "'" and q2 == "'":
                combined = combined.replace('"', '\\"')
            return f'"{combined}"'

        curr = RE_STR_CONCAT.sub(replacer, curr)

    return curr, count


def inline_string_lookup_arrays(code: str) -> Tuple[str, int]:
    """
    Detects Obfuscator.io string array tables and inlines direct indexed references.
    Example:
      var _0x1a = ['child_process', 'execSync'];
      require(_0x1a[0]) -> require('child_process')
    """
    count = 0
    tables: Dict[str, List[str]] = {}

    # 1. Parse string arrays
    for match in RE_STRING_ARRAY_DECL.finditer(code):
        var_name = match.group(1)
        raw_items = match.group(2)
        # Parse items using RE_STRING_LITERAL
        items = []
        for item_match in RE_STRING_LITERAL.finditer(raw_items):
            raw_val = item_match.group(0)
            val = raw_val[1:-1]
            items.append(val)
        if items and len(items) >= 2:
            tables[var_name] = items

    if not tables:
        return code, 0

    # 2. Check for wrapper functions: function _0x2b(x) { return _0x1a[x]; }
    wrappers: Dict[str, str] = {}
    for match in RE_WRAPPER_FUNC.finditer(code):
        wrapper_name = match.group(1)
        target_table = match.group(3)
        if target_table in tables:
            wrappers[wrapper_name] = target_table

    # 3. Substitute direct accesses: table[0] or wrapper(0)
    for table_name, items in tables.items():
        # table[idx]
        pattern_index = re.compile(rf"\b{re.escape(table_name)}\s*\[\s*(\d+)\s*\]")

        def repl_idx(m: re.Match) -> str:
            nonlocal count
            idx = int(m.group(1))
            if 0 <= idx < len(items):
                count += 1
                safe_val = items[idx].replace('"', '\\"')
                return f'"{safe_val}"'
            return m.group(0)

        code = pattern_index.sub(repl_idx, code)

    for wrapper_name, table_name in wrappers.items():
        items = tables[table_name]
        # wrapper(idx)
        pattern_call = re.compile(rf"\b{re.escape(wrapper_name)}\s*\(\s*(\d+)\s*\)")

        def repl_call(m: re.Match) -> str:
            nonlocal count
            idx = int(m.group(1))
            if 0 <= idx < len(items):
                count += 1
                safe_val = items[idx].replace('"', '\\"')
                return f'"{safe_val}"'
            return m.group(0)

        code = pattern_call.sub(repl_call, code)

    return code, count


def normalize_computed_properties(code: str) -> Tuple[str, int]:
    """
    Converts computed bracket access with constant string keys to standard dot notation:
      process['env'] -> process.env
      require('child_process')['execSync'] -> require('child_process').execSync
      global['eval'] -> eval
    """
    count = 0

    # Global wrappers
    def repl_global(m: re.Match) -> str:
        nonlocal count
        count += 1
        return m.group(2)

    code = RE_GLOBAL_CALL.sub(repl_global, code)

    # General obj['property'] - loop to resolve chained accesses like a['b']['c']
    prev = None
    curr = code
    for _ in range(5):
        if prev == curr:
            break
        prev = curr

        def repl_prop(m: re.Match) -> str:
            nonlocal count
            obj = m.group(1)
            prop = m.group(3)
            if RE_VALID_IDENTIFIER.match(prop):
                count += 1
                return f"{obj}.{prop}"
            return m.group(0)

        curr = RE_COMPUTED_PROP.sub(repl_prop, curr)

    return curr, count


def strip_token_dilution_and_comments(code: str) -> Tuple[str, int]:
    """
    Safely strips standalone JavaScript comments and excessive blank lines to neutralize
    adversarial token dilution attacks without touching inline regex literals (/https?:\\/\\//).
    """
    orig_len = len(code)
    no_multi = RE_MULTI_LINE_COMMENT.sub("", code)
    no_comments = RE_SINGLE_LINE_COMMENT.sub("", no_multi)
    stripped_chars = orig_len - len(no_comments)
    collapsed = re.sub(r"\n\s*\n\s*\n+", "\n\n", no_comments)
    return collapsed, stripped_chars


def deobfuscate_javascript(code: str) -> Tuple[str, Dict[str, Any]]:
    """
    Complete AST de-obfuscation pipeline for JavaScript.
    Returns:
      (cleaned_code, telemetry_stats)
    """
    stats = {
        "decoded_escapes": 0,
        "folded_concats": 0,
        "inlined_lookups": 0,
        "normalized_props": 0,
        "stripped_comment_chars": 0,
        "orig_bytes": len(code.encode("utf-8", errors="replace")),
        "final_bytes": 0,
    }

    # Step 1: Strip adversarial comments & token dilution
    c1, stripped_chars = strip_token_dilution_and_comments(code)
    stats["stripped_comment_chars"] = stripped_chars

    # Step 2: Decode hex and unicode escape sequences
    c2, escapes = decode_string_escapes(c1)
    stats["decoded_escapes"] = escapes

    # Step 3: Fold string concatenations
    c3, concats = fold_string_concatenations(c2)
    stats["folded_concats"] = concats

    # Step 4: Inline string lookup arrays and wrapper functions
    c4, inlined = inline_string_lookup_arrays(c3)
    stats["inlined_lookups"] = inlined

    # Step 5: Second pass of concatenation folding (in case inlining exposed new concats)
    if inlined > 0:
        c4, concats2 = fold_string_concatenations(c4)
        stats["folded_concats"] += concats2

    # Step 6: Normalize computed properties
    c5, props = normalize_computed_properties(c4)
    stats["normalized_props"] = props

    # Sanitize any lone surrogates before returning to Rust tokenizers
    c5 = c5.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    stats["final_bytes"] = len(c5.encode("utf-8", errors="replace"))
    return c5, stats


def run_self_test() -> bool:
    """Built-in verification test suite."""
    test_cases = [
        # Case 1: Hex escape decoding
        (
            r'const cp = require("\x63\x68\x69\x6c\x64\x5f\x70\x72\x6f\x63\x65\x73\x73");',
            'const cp = require("child_process");',
        ),
        # Case 2: String concatenation folding
        (
            r'const mod = "child_" + "process"; const act = "ex" + "ec" + "Sync";',
            'const mod = "child_process"; const act = "execSync";',
        ),
        # Case 3: Obfuscator.io string array inlining
        (
            """
            var _0xabc = ["child_process", "execSync", "https"];
            const cp = require(_0xabc[0]);
            cp[_0xabc[1]]("whoami");
            """,
            'const cp = require("child_process");\n            cp.execSync("whoami");',
        ),
        # Case 4: Computed property normalization
        (
            r'process["env"]["AWS_SECRET"] = 1; global["eval"]("foo");',
            'process.env.AWS_SECRET = 1; eval("foo");',
        ),
        # Case 5: Token dilution & comment stripping
        (
            """
            /* This is benign documentation comment that repeats 1000 times */
            // inline comment
            const x = 1;
            """,
            "const x = 1;",
        ),
    ]

    all_passed = True
    print("[*] Running PackGuard Stage 2 v4 AST De-obfuscator Self-Test...")

    for i, (input_code, expected_snippet) in enumerate(test_cases, 1):
        cleaned, stats = deobfuscate_javascript(input_code)
        # Check that the expected de-obfuscated snippet is present
        clean_norm = re.sub(r"\s+", " ", cleaned).strip()
        exp_norm = re.sub(r"\s+", " ", expected_snippet).strip()
        passed = exp_norm in clean_norm

        if passed:
            print(f"  [+] Test {i} PASSED (Stats: {stats})")
        else:
            print(f"  [-] Test {i} FAILED")
            print(f"      Expected in: {exp_norm}")
            print(f"      Actual:      {clean_norm}")
            all_passed = False

    if all_passed:
        print("[+] ALL 5 AST DE-OBFUSCATION TESTS PASSED SUCCESSFULLY!")
    return all_passed


if __name__ == "__main__":
    import sys
    success = run_self_test()
    sys.exit(0 if success else 1)
