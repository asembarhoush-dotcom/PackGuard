const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

hexo.extend.filter.register('before_generate', function () {
  const lettersFilePath = path.join(hexo.base_dir, "custom-scripts/font/letters.txt")
  if (!fs.existsSync(lettersFilePath)) return;

  const content = fs.readFileSync(lettersFilePath);
  const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);

  const scssPath = path.join(hexo.base_dir, 'themes', hexo.config.theme, 'source', 'css', 'font-version.scss');
  fs.writeFileSync(scssPath, `$font-version: "${hash}";\n`);
});