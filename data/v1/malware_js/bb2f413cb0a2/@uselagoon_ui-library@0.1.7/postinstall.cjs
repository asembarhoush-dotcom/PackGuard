const fs = require('fs').promises;
const path = require('path');

const currentDirectory = process.cwd();

const isYarn = process.env.npm_execpath && process.env.npm_execpath.includes('yarn');

(async function script() {
	if (isYarn) {
		const filesToKeep = ['dist', 'README.md', 'package.json', 'LICENSE'];

		const allFiles = await fs.readdir(currentDirectory);

		const filesToDelete = allFiles.filter((file) => !filesToKeep.includes(file));

		for (const file of filesToDelete) {
			const fullPath = path.join(currentDirectory, file);
			if ((await fs.stat(fullPath)).isDirectory()) {
				await fs.rmdir(fullPath, { recursive: true });
			} else {
				await fs.unlink(fullPath);
			}
		}
	}
})();
