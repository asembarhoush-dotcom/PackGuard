"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorize = void 0;
const color_default_1 = __importStar(require("./color.default"));
function createBackgroundMethods(color) {
    const backgroundMethods = {};
    Object.keys(color_default_1.Bg).forEach((bgMethod) => {
        const methodName = bgMethod;
        const backgroundKey = methodName.replace('Bg', '');
        backgroundMethods[backgroundKey] = () => (0, color_default_1.default)(color, '', [], backgroundKey);
    });
    return backgroundMethods;
}
exports.colorize = {};
for (const color of Object.keys(color_default_1.Color)) {
    exports.colorize[color] = Object.assign((text = '', background) => (0, color_default_1.default)(color, text, [], background), createBackgroundMethods(color));
}
