"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZaloApi = void 0;
class ZaloApi {
    constructor() {
        this.name = 'zaloApi';
        this.displayName = 'Zalo API';
        this.documentationUrl = 'https://developers.zalo.me/docs';
        this.icon = 'file:shared/zalo.svg';
        this.properties = [
            {
                displayName: 'Cookie',
                name: 'cookie',
                type: 'string',
                default: '',
                typeOptions: {
                    password: true,
                },
                description: 'Cookie from Zalo login session',
            },
            {
                displayName: 'IMEI',
                name: 'imei',
                type: 'string',
                default: '',
                description: 'IMEI identifier from Zalo login session',
            },
            {
                displayName: 'User Agent',
                name: 'userAgent',
                type: 'string',
                default: '',
                description: 'User Agent from Zalo login session',
            },
            {
                displayName: 'Proxy',
                name: 'proxy',
                type: 'string',
                default: '',
                placeholder: 'http(s)://user:pass@host:port',
                description: 'HTTP proxy to use for Zalo API requests',
            },
            {
                displayName: 'Support Code',
                name: 'supportCode',
                type: 'string',
                default: '',
                description: 'Support code for Zalo API',
            },
            {
                displayName: 'License Key',
                name: 'licenseKey',
                type: 'string',
                default: '',
                description: 'License key for Zalo API',
                typeOptions: {
                    password: true,
                },
            },
        ];
    }
}
exports.ZaloApi = ZaloApi;
//# sourceMappingURL=ZaloApi.credentials.js.map