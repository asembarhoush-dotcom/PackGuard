"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bg = exports.Background = exports.Color = void 0;
var Color;
(function (Color) {
    Color["Black"] = "\u001B[30m";
    Color["Red"] = "\u001B[31m";
    Color["Green"] = "\u001B[32m";
    Color["Yellow"] = "\u001B[33m";
    Color["Blue"] = "\u001B[34m";
    Color["Magenta"] = "\u001B[35m";
    Color["Cyan"] = "\u001B[36m";
    Color["White"] = "\u001B[37m";
    Color["Gray"] = "\u001B[90m";
    Color["BrightRed"] = "\u001B[91m";
    Color["BrightGreen"] = "\u001B[92m";
    Color["BrightYellow"] = "\u001B[93m";
    Color["BrightBlue"] = "\u001B[94m";
    Color["BrightMagenta"] = "\u001B[95m";
    Color["BrightCyan"] = "\u001B[96m";
    Color["BrightWhite"] = "\u001B[97m";
    Color["Custom"] = "custom";
    Color["Rgb"] = "rgb";
    Color["Bold"] = "\u001B[1m";
    Color["Italic"] = "\u001B[3m";
    Color["Underline"] = "\u001B[4m";
    Color["Inverse"] = "\u001B[7m";
    Color["Strike"] = "\u001B[9m";
})(Color || (exports.Color = Color = {}));
var Background;
(function (Background) {
    Background["Black"] = "\u001B[40m";
    Background["Red"] = "\u001B[41m";
    Background["Green"] = "\u001B[42m";
    Background["Yellow"] = "\u001B[43m";
    Background["Blue"] = "\u001B[44m";
    Background["Magenta"] = "\u001B[45m";
    Background["Cyan"] = "\u001B[46m";
    Background["White"] = "\u001B[47m";
    Background["Gray"] = "\u001B[100m";
    Background["BrightRed"] = "\u001B[101m";
    Background["BrightGreen"] = "\u001B[102m";
    Background["BrightYellow"] = "\u001B[103m";
    Background["BrightBlue"] = "\u001B[104m";
    Background["BrightMagenta"] = "\u001B[105m";
    Background["BrightCyan"] = "\u001B[106m";
    Background["BrightWhite"] = "\u001B[107m";
    Background["Custom"] = "custom";
    Background["Rgb"] = "rgb";
})(Background || (exports.Background = Background = {}));
exports.Bg = {
    BgBlack: '\x1b[40m',
    BgRed: '\x1b[41m',
    BgGreen: '\x1b[42m',
    BgYellow: '\x1b[43m',
    BgBlue: '\x1b[44m',
    BgMagenta: '\x1b[45m',
    BgCyan: '\x1b[46m',
    BgWhite: '\x1b[47m',
    BgGray: '\x1b[100m',
    BgBrightRed: '\x1b[101m',
    BgBrightGreen: '\x1b[102m',
    BgBrightYellow: '\x1b[103m',
    BgBrightBlue: '\x1b[104m',
    BgBrightMagenta: '\x1b[105m',
    BgBrightCyan: '\x1b[106m',
    BgBrightWhite: '\x1b[107m',
};
function validateRgb(r, g, b) {
    return [r, g, b].every((value) => value >= 0 && value <= 255);
}
function applyColor(color = 'Black', text, args = [], background = 'Black') {
    if ((color === 'Custom' || color === 'Rgb') && !validateRgb(args[0], args[1], args[2])) {
        throw new Error('Invalid RGB values. Each value must be between 0 and 255.');
    }
    const colors = {
        ...Object.keys(Color).reduce((acc, key) => {
            acc[key] = Color[key];
            return acc;
        }, {}),
        Custom: (r, g, b, a = 1) => `\x1b[38;2;${r};${g};${b};${a}m`,
        Rgb: (r, g, b, a = 1) => `\x1b[38;2;${r};${g};${b};${a}m`
    };
    const backgrounds = {
        ...Object.keys(Background).reduce((acc, key) => {
            acc[key] = Background[key];
            return acc;
        }, {}),
        Custom: (r, g, b, a = 1) => `\x1b[48;2;${r};${g};${b};${a}m`,
        Rgb: (r, g, b, a = 1) => `\x1b[48;2;${r};${g};${b};${a}m`
    };
    const reset = '\x1b[0m';
    if (!colors[color] && color !== 'Custom' && color !== 'Rgb') {
        throw new Error(`Color '${color}' not supported`);
    }
    const colorCode = typeof colors[color] === 'function' ? '' : colors[color];
    const backgroundCode = typeof backgrounds[background] === 'function' ? '' : backgrounds[background];
    if (color === 'Custom' || color === 'Rgb') {
        const [r, g, b, a = 1] = args;
        const colorFunction = colors[color];
        return `${colorFunction(r, g, b, a)}${backgroundCode}${text}${reset}`;
    }
    else {
        return `${colorCode}${backgroundCode}${text}${reset}`;
    }
}
exports.default = applyColor;
