import os

HERE = os.path.dirname(os.path.abspath(__file__))

CASES = {
    "reexport_openai.js": '''"use strict";
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("@openai/agents-realtime"), exports);
//# sourceMappingURL=index.js.map
''',
    "reexport_sqs.js": '''"use strict";
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Producer = void 0;
var producer_js_1 = require("./producer.js");
Object.defineProperty(exports, "Producer", { enumerable: true, get: function () { return producer_js_1.Producer; } });
__exportStar(require("./types.js"), exports);
''',
    "stub_marker.js": '''"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
''',
    "minified_reexport.js": '"use strict";var __exportStar=(this&&this.__exportStar)||function(m,exports){for(var p in m)if(p!=="default"&&!Object.prototype.hasOwnProperty.call(exports,p))exports[p]=m[p];};Object.defineProperty(exports,"__esModule",{value:true});__exportStar(require("./x"),exports);',
    "esm_reexport.js": '''export * from "./x.js";
export { a, b } from "./y.js";
''',
    "helper_then_code.js": '''"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    o[k2] = m[k];
}));
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = function () { return 1; };
''',
    "real_code.js": '''"use strict";
const fs = require("fs");
exports.read = function (path) {
    return fs.readFileSync(path, "utf8");
};
''',
    "esm_code.js": '''export const answer = 42;
export function run() { return answer; }
''',
    "string_mention.js": '''"use strict";
console.log("var __createBinding = 1; Object.defineProperty(exports, '__esModule', { value: true });");
''',
    "source_map_only.js": '//# sourceMappingURL=data:application/json;base64,AAAA\n',
    "strict_only.js": '"use strict";\n',
}


def main():
    for name, text in CASES.items():
        with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    print(f"wrote {len(CASES)} inputs")


if __name__ == "__main__":
    main()
