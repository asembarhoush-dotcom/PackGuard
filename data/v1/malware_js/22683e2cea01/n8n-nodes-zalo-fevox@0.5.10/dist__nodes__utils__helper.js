"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveFile = saveFile;
exports.removeFile = removeFile;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
async function saveFile(url) {
    try {
        const n8nUserFolder = process.env.N8N_USER_FOLDER || path_1.default.join(os_1.default.homedir(), '.n8n');
        const dataStoragePath = path_1.default.join(n8nUserFolder, 'temp_files');
        if (!fs_1.default.existsSync(dataStoragePath)) {
            fs_1.default.mkdirSync(dataStoragePath, { recursive: true });
        }
        const urlPath = new URL(url).pathname;
        const ext = path_1.default.extname(urlPath) || '.bin';
        const timestamp = Date.now();
        const filePath = path_1.default.join(dataStoragePath, `temp-${timestamp}${ext}`);
        const { data } = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        fs_1.default.writeFileSync(filePath, data);
        return filePath;
    }
    catch (error) {
        console.error('Lỗi khi tải/lưu file:', error);
        return null;
    }
}
function removeFile(filePath) {
    try {
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
    }
    catch (error) {
        console.error('Lỗi khi xoá file:', error);
    }
}
//# sourceMappingURL=helper.js.map