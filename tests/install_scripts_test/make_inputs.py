import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, "experiments", "v2", "scripts"))
from build_dataset import install_scripts

CHECK = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "install_scripts_check")


def esc(data):
    return data.replace(b"%U", bytes([92]) + b"u")


CASES = {
    "all_hooks": b'{"name":"x","scripts":{"postinstall":"node c.js","test":"jest","install":"node b.js","preinstall":"node a.js"}}',
    "none": b'{"name":"x","version":"1.0.0"}',
    "other_scripts_only": b'{"scripts":{"build":"tsc","prepare":"husky install","test":"jest"}}',
    "escapes": esc(rb'{"scripts":{"preinstall":"curl \"http://x\" %U0026%U0026 echo %U00e9%Ud83d%Ude00\/\t\\\b\f\r\n"}}'),
    "lone_surrogate": esc(rb'{"scripts":{"install":"a%Ud800b%Udc00c"}}'),
    "bad_escape": rb'{"scripts":{"install":"a\xb"}}',
    "short_unicode_escape": esc(rb'{"scripts":{"install":"a%U12"}}'),
    "duplicate_hook": b'{"scripts":{"preinstall":"first","preinstall":"second"}}',
    "duplicate_hook_not_string": b'{"scripts":{"preinstall":"first","preinstall":5}}',
    "duplicate_scripts": b'{"scripts":{"preinstall":"old"},"scripts":{"postinstall":"new"}}',
    "scripts_not_object": b'{"scripts":"node a.js"}',
    "nested_scripts_ignored": b'{"config":{"scripts":{"preinstall":"nested"}},"scripts":{"postinstall":"top"}}',
    "escaped_key": esc(rb'{"scr%U0069pts":{"post%U0069nstall":"escaped key"}}'),
    "empty_command": b'{"scripts":{"preinstall":"","postinstall":"node x.js"}}',
    "bom": b'\xef\xbb\xbf{"scripts":{"preinstall":"with bom"}}',
    "raw_utf8": b'{"scripts":{"preinstall":"echo h\xc3\xa9llo \xe2\x9c\x93"}}',
    "invalid_utf8": b'{"scripts":{"preinstall":"bad \xff\xfe bytes"}}',
    "invalid_trailing_comma": b'{"scripts":{"preinstall":"x",}}',
    "invalid_trailing_data": b'{"scripts":{"preinstall":"x"}} extra',
    "invalid_control_char": b'{"scripts":{"preinstall":"a\nb"}}',
    "invalid_nan": b'{"v":NaN,"scripts":{"preinstall":"x"}}',
    "invalid_leading_zero": b'{"v":01,"scripts":{"preinstall":"x"}}',
    "top_level_array": b'[{"scripts":{"preinstall":"x"}}]',
    "numbers_and_literals": b'{"a":-0.5e+3,"b":[true,false,null,{}],"c":0,"scripts":{"install":"ok"}}',
    "whitespace": b' \r\n\t{ "scripts" : { "postinstall" : "spaced" } } \n',
    "nesting_at_limit": b'{"a":' + b"[" * 511 + b"]" * 511 + b',"scripts":{"preinstall":"deep"}}',
    "nesting_over_limit": b'{"a":' + b"[" * 512 + b"]" * 512 + b',"scripts":{"preinstall":"deep"}}',
    "nesting_far_over_limit": b'{"a":' + b"[" * 10000 + b"]" * 10000 + b',"scripts":{"preinstall":"deep"}}',
    "empty_file": b"",
}

fails = 0
for name, data in CASES.items():
    src = os.path.join(HERE, name + ".json")
    out = os.path.join(HERE, name + ".out")
    with open(src, "wb") as f:
        f.write(data)
    subprocess.run([CHECK, src, out], check=True)
    got = open(out, "rb").read()
    want = install_scripts(data)
    ok = got == want
    fails += not ok
    print(f"{'ok  ' if ok else 'DIFF'} {name}: {got[:80]!r}" + ("" if ok else f" python {want[:80]!r}"))
print("all match" if not fails else f"{fails} differ")
sys.exit(1 if fails else 0)
