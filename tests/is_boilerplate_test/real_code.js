"use strict";
const fs = require("fs");
exports.read = function (path) {
    return fs.readFileSync(path, "utf8");
};
