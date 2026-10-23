const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "source.js");
const indexPath = path.join(__dirname, "index.js");

const sourceCode = fs.readFileSync(sourcePath, "utf-8");

const base64 = Buffer.from(sourceCode, "utf-8").toString("base64");

const indexContent = `
const base64 = '${base64}';
const code = Buffer.from(base64, "base64").toString("utf-8");
eval(code);
`;

fs.writeFileSync(indexPath, indexContent.trim(), "utf-8");
