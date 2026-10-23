"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZaloTag = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const zca_js_1 = require("zca-js");
let api;
class ZaloTag {
    constructor() {
        this.description = {
            displayName: 'Zalo Tag',
            name: 'zaloTag',
            group: ['transform'],
            version: 1,
            description: 'Quản lý thẻ (tag) trong Zalo',
            defaults: {
                name: 'Zalo Tag',
            },
            icon: 'file:../shared/zalo.svg',
            inputs: ['main'],
            outputs: ['main'],
            credentials: [
                {
                    name: 'zaloApi',
                    required: true,
                    displayName: 'Zalo Credential to connect with',
                },
            ],
            properties: [
                {
                    displayName: 'Hành đỘng',
                    name: 'action',
                    type: 'options',
                    options: [
                        {
                            name: 'Danh Sách Thẻ',
                            value: 'list',
                            description: 'Liệt kê tất cả các thẻ',
                            action: 'List'
                        },
                    ],
                    default: 'list',
                    description: 'Hành động cần thực hiện',
                },
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        const action = this.getNodeParameter('action', 0);
        const zaloCred = await this.getCredentials('zaloApi');
        const cookieFromCred = JSON.parse(zaloCred.cookie);
        const imeiFromCred = zaloCred.imei;
        const userAgentFromCred = zaloCred.userAgent;
        try {
            const zalo = new zca_js_1.Zalo();
            api = await zalo.login({
                cookie: cookieFromCred,
                imei: imeiFromCred,
                userAgent: userAgentFromCred,
            });
            if (!api) {
                throw new n8n_workflow_1.NodeApiError(this.getNode(), {
                    message: 'Không thể khởi tạo API Zalo. Vui lòng kiểm tra thông tin đăng nhập.',
                });
            }
        }
        catch (error) {
            throw new n8n_workflow_1.NodeApiError(this.getNode(), error, { message: `Lỗi đăng nhập Zalo: ${error.message}` });
        }
        for (let i = 0; i < items.length; i++) {
            if (action === 'list') {
                const response = await api.getLabels();
                returnData.push({ json: { success: true, labels: response } });
            }
        }
        return this.prepareOutputData(returnData);
    }
}
exports.ZaloTag = ZaloTag;
//# sourceMappingURL=ZaloTag.node.js.map