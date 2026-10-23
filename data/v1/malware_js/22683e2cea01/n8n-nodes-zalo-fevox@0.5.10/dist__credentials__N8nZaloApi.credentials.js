"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.N8nZaloApi = void 0;
class N8nZaloApi {
    constructor() {
        this.name = 'n8nZaloApi';
        this.displayName = 'n8n Zalo Account Credential';
        this.documentationUrl = 'n8n-n8n-api';
        this.icon = 'file:shared/n8n.png';
        this.properties = [
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                default: '',
                description: 'The API key used to authenticate with the n8n API.',
                required: true,
            },
            {
                displayName: 'URL',
                name: 'url',
                type: 'string',
                default: 'http://127.0.0.1:5678',
                description: 'The URL of the n8n instance',
                required: true,
            }
        ];
    }
}
exports.N8nZaloApi = N8nZaloApi;
//# sourceMappingURL=N8nZaloApi.credentials.js.map