import base64
import re
from typing import Any, Dict, List, Set, Tuple

# Pre-compiled patterns for T1/T3/T4 canonicalization and real-world obfuscation unfolding
RE_REFORMATTED_HEADER = re.compile(r"^/\*\s*reformatted\s*\*/\r?\n?", re.MULTILINE)
RE_PADDED_HEADER = re.compile(r"^/\*\s*padded\s*\*/\r?\n?", re.MULTILINE)
RE_PG_PAD_FUNC = re.compile(
    r"function\s+(?:_pg_pad_\d+|v\d+)\s*\(\)\s*\{\s*var\s+(?:x|v\d+)\s*=\s*\d+\s*;\s*return\s+(?:x|v\d+)\s*;\s*\}\r?\n?"
)
RE_EVAL_BASE64_WRAPPER = re.compile(
    r'eval\s*\(\s*Buffer\.from\s*\(\s*["\']([A-Za-z0-9+/=\s]{16,})["\']\s*,\s*["\']base64["\']\s*\)\.toString\s*\([^)]*\)\s*\)\s*;?'
)
RE_INLINE_BASE64 = re.compile(
    r'(?:Buffer\.from\s*\(\s*["\']([A-Za-z0-9+/=]{24,})["\']\s*,\s*["\']base64["\']\s*\)|atob\s*\(\s*["\']([A-Za-z0-9+/=]{24,})["\']\s*\))'
)
RE_REPEATED_OBF_TOKEN = re.compile(r"([^\s()[\]{}.,;:=+\-*/\"'`]{5,24}?)\1{2,}")
RE_T2_IDENT = re.compile(r"\bv(?:0|1|2|3|4|5|6|7|8|9|1\d)\b")
RE_T2_RANDOM_STRING = re.compile(r'(["\'])([a-z0-9]{14,})\1')
RE_REQUIRE_CALL = re.compile(r"\brequire\s*\(\s*([\"'][^\"']*[\"'])?\s*\)")
RE_PROCESS_ACCESS = re.compile(r"\bprocess\s*\.\s*[A-Za-z0-9_$]+")
RE_BUFFER_ACCESS = re.compile(r"\bBuffer\s*\.\s*[A-Za-z0-9_$]+")
RE_EVAL_OR_FUNC = re.compile(r"\b(?:eval\s*\(|new\s+Function\b|Function\s*\()")
RE_EXEC_SPAWN = re.compile(r"\b(?:child_process|execSync|execFile|spawnSync|exec\s*\(|spawn\s*\()", re.I)
RE_NET_EXFIL = re.compile(
    r"\b(?:https?\.request|dns\.lookup|dns\.resolve|net\.Socket|fetch\s*\(|axios|webhook|discord|telegram|oast|burp|interact\.sh|pipedream|requestbin)\b",
    re.I,
)


def _extract_structural_summary(text: str) -> str:
    """
    Extract an obfuscation-invariant structural signature from preserved JS keywords
    (`require`, `process`, `Buffer`, `eval`, `global`) and API patterns.
    Survives `T2` identifier/string mangling (`mangle.py` preserves `require`, `process`,
    `Buffer`, `eval`, `global`, `module`, `exports`) and distinguishes pure data/lookup
    tables (`character-entities-legacy`, `timezone-name-offsets`, `mime-db`) from active
    process/network/eval payloads.
    """
    req_matches = RE_REQUIRE_CALL.findall(text)
    req_count = len(req_matches)
    req_lens = [str(len(m) - 2) for m in req_matches[:8] if len(m) >= 2]
    proc_count = len(RE_PROCESS_ACCESS.findall(text))
    buf_count = len(RE_BUFFER_ACCESS.findall(text))
    eval_count = len(RE_EVAL_OR_FUNC.findall(text))
    exec_count = len(RE_EXEC_SPAWN.findall(text))
    net_count = len(RE_NET_EXFIL.findall(text))
    t2_ident_hits = len(RE_T2_IDENT.findall(text[:4096]))
    is_t2_style = t2_ident_hits >= 6

    is_pure_data = (
        req_count == 0
        and proc_count == 0
        and buf_count == 0
        and eval_count == 0
        and exec_count == 0
        and net_count == 0
    )
    req_len_tag = ",".join(req_lens) if req_lens else "none"
    return (
        f"// [SIGNALS: t2_mangled={int(is_t2_style)} pure_data={int(is_pure_data)} "
        f"require={req_count}(lens:{req_len_tag}) process={proc_count} "
        f"buffer={buf_count} eval={eval_count} exec={exec_count} net={net_count}]"
    )


def _try_decode_base64_utf8(b64_str: str) -> str:
    """Safely decode a base64 string if it represents printable UTF-8 text/code."""
    try:
        clean_b64 = re.sub(r"\s+", "", b64_str)
        pad = (-len(clean_b64)) % 4
        if pad:
            clean_b64 += "=" * pad
        raw = base64.b64decode(clean_b64, validate=False)
        if not raw or len(raw) < 4:
            return ""
        text = raw.decode("utf-8", errors="replace")
        # Reject binary blobs that decode mostly to replacement chars or control chars
        valid_chars = sum(
            1 for ch in text if (ch.isprintable() or ch in "\r\n\t") and ch != "\ufffd"
        )
        if valid_chars / max(len(text), 1) >= 0.80:
            return text
    except Exception:
        pass
    return ""


def clean_and_unfold_js(text: str) -> str:
    """
    Canonicalize JavaScript / install-script text:
    1. Unfolds full-file or inline base64 eval wrappers (T4 and real-world base64 droppers)
       back into their exact original source code.
    2. Strips synthetic dead-code padding functions (T3 `_pg_pad_` and T2-renamed padding).
    3. Removes formatting comments/indentation artifacts (T1 `/* reformatted */`).
    4. Deduplicates consecutive repeated lines so filler never exhausts the 8,192-token window.
    """
    if not text:
        return ""

    # Step 1: Unfold T4 full-file base64 eval wrappers (including nested base64 up to 2 levels)
    for _ in range(2):
        def _replace_eval_b64(match: re.Match) -> str:
            decoded = _try_decode_base64_utf8(match.group(1))
            if decoded:
                return decoded
            return match.group(0)

        new_text = RE_EVAL_BASE64_WRAPPER.sub(_replace_eval_b64, text)
        if new_text == text:
            break
        text = new_text

    # Step 2: Append decoded content for any remaining inline Buffer.from(..., "base64") / atob(...)
    inline_decoded: List[str] = []
    for match in RE_INLINE_BASE64.finditer(text):
        b64_candidate = match.group(1) or match.group(2)
        if b64_candidate:
            decoded = _try_decode_base64_utf8(b64_candidate)
            if decoded and decoded not in text and decoded not in inline_decoded:
                inline_decoded.append(decoded[:4096])

    # Step 3: Remove T3 dead-code padding functions, repeated obfuscator prefixes, and T1/T3 header markers
    text = RE_PADDED_HEADER.sub("", text)
    text = RE_PG_PAD_FUNC.sub("", text)
    text = RE_REPEATED_OBF_TOKEN.sub(r"\1", text)

    if RE_REFORMATTED_HEADER.search(text):
        text = RE_REFORMATTED_HEADER.sub("", text)
        lines = [(line[2:] if line.startswith("  ") else line) for line in text.splitlines()]
        text = "\n".join(lines)

    struct_sig = _extract_structural_summary(text)

    # Compress T2 random alphanumeric string literals so they do not exhaust BPE tokens
    if len(RE_T2_IDENT.findall(text[:4096])) >= 5:
        text = RE_T2_RANDOM_STRING.sub(
            lambda m: f'{m.group(1)}<t2str_{len(m.group(2))}>{m.group(1)}',
            text,
        )

    # Step 4: Collapse consecutive identical lines (e.g. template padding) keeping at most 2
    out_lines: List[str] = []
    prev_line = None
    repeat_count = 0
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and stripped == prev_line:
            repeat_count += 1
            if repeat_count >= 2:
                continue
        else:
            prev_line = stripped
            repeat_count = 0
        out_lines.append(line)

    cleaned = "\n".join(out_lines).strip()
    if inline_decoded:
        cleaned += "\n/* [DECODED_INLINE_BASE64] */\n" + "\n".join(inline_decoded)
    if cleaned and not cleaned.startswith("// [SIGNALS:"):
        cleaned = f"{struct_sig}\n{cleaned}"
    return cleaned


def is_install_script_chunk(chunk: Dict[str, Any]) -> bool:
    """Return True if the chunk represents package.json install hooks or install_scripts.txt."""
    kind = str(chunk.get("kind", "")).lower()
    if kind == "script":
        return True
    file_name = str(chunk.get("file", "")).lower()
    return "install_scripts.txt" in file_name or "package.json" in file_name


def _reassemble_file_chunks(file_chunks: List[Dict[str, Any]]) -> str:
    """
    Reconstruct a complete file from Stage 1 sliding-window chunks (8 KiB window, 4 KiB step)
    using each chunk's byte `start` offset.
    This guarantees that multi-chunk T4 base64 wrappers and T3 dead-code padding blocks
    are never cut in half at 8 KiB chunk boundaries before unfolding.
    """
    sorted_by_start = sorted(file_chunks, key=lambda c: int(c.get("start", 0) or 0))
    buf = b""
    for ch in sorted_by_start:
        raw_text = str(ch.get("text", ""))
        ch_bytes = raw_text.encode("utf-8", errors="surrogateescape")
        start = int(ch.get("start", 0) or 0)
        if not buf:
            buf = ch_bytes
        elif start <= len(buf):
            overlap = len(buf) - start
            if len(ch_bytes) > overlap:
                buf += ch_bytes[overlap:]
        else:
            buf += b"\n" + ch_bytes
    return buf.decode("utf-8", errors="replace")


def format_scanner_chunks_to_text(record: Dict[str, Any]) -> str:
    """
    Convert a PackGuard Stage 1 report JSON (or training record) into a leak-free,
    canonicalized source document for ModernBERT's 8,192-token window.

    Key v2 Improvements over v1:
    1. Reassembles sliding-window chunks per file using `start` byte offsets so T3 padding
       and T4 base64 wrappers spanning multiple 8 KiB windows are unfolded completely.
    2. Eliminates synthetic Stage 1 NCD score numbers and benchmark package prefixes from
       the prompt text so the model cannot take metadata shortcuts.
    3. Unifies `package.json`, `package.json#scripts`, and `install_scripts.txt` into a
       single canonical `// [INSTALL_SCRIPTS]` section header.
    4. Automatically unfolds T4 base64 wrappers and collapses T3 dead-code padding so
       T0, T1, T3, and T4 produce identical clean JavaScript code.
    5. Prioritizes files by (install_script, stage1_flagged, min_ncd) so the most relevant
       code regions always sit at the start of the 8,192-token context window.
    """
    if "text" in record and isinstance(record["text"], str) and "chunks" not in record:
        raw_txt = record["text"]
        if str(record.get("tier", "")).endswith("_raw") or raw_txt.startswith("// ["):
            return raw_txt
        cleaned = clean_and_unfold_js(raw_txt)
        return cleaned if cleaned else raw_txt

    chunks = record.get("chunks") or []
    if not chunks:
        return "// [EMPTY_PACKAGE]"

    # Group chunks by file while preserving file priority (install script, flagged, min ncd)
    by_file: Dict[str, List[Dict[str, Any]]] = {}
    for ch in chunks:
        fname = str(ch.get("file", "unknown.js"))
        by_file.setdefault(fname, []).append(ch)

    def _file_priority(item: Tuple[str, List[Dict[str, Any]]]):
        fname, fchunks = item
        is_script = 0 if any(is_install_script_chunk(c) for c in fchunks) else 1
        is_payload = 0 if "#payload" in fname else 1
        is_flagged = 0 if any(bool(c.get("flagged", False)) for c in fchunks) else 1
        min_ncd = min(
            float(c.get("ncd", 1.0) if c.get("ncd") is not None else 1.0) for c in fchunks
        )
        return (is_script, is_flagged, is_payload, min_ncd, fname)

    sorted_files = sorted(by_file.items(), key=_file_priority)

    sections: List[str] = []
    seen_texts: Set[int] = set()

    for fname, fchunks in sorted_files:
        reassembled = _reassemble_file_chunks(fchunks)
        cleaned_text = clean_and_unfold_js(reassembled)
        if not cleaned_text:
            continue

        # Deduplicate identical unfolded code (e.g., unfolded T4 main file vs #payload0)
        text_hash = hash(cleaned_text)
        if text_hash in seen_texts:
            continue
        seen_texts.add(text_hash)

        if any(is_install_script_chunk(c) for c in fchunks):
            header = "// [INSTALL_SCRIPTS]"
        else:
            header = "// [JS_CODE]"

        sections.append(f"{header}\n{cleaned_text}")

    if not sections:
        return "// [EMPTY_PACKAGE]"

    return "\n\n".join(sections)
