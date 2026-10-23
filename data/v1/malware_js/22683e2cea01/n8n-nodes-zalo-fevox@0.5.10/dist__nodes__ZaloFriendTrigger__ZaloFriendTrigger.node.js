"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZaloFriendTrigger = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const zca_js_1 = require("zca-js");
let api;
let reconnectTimer;
class ZaloFriendTrigger {
    constructor() {
        this.description = {
            displayName: 'Zalo Friend Trigger',
            name: 'zaloFriendTrigger',
            icon: 'file:../shared/zalo.svg',
            group: ['trigger'],
            version: 1,
            description: 'Lắng nghe sự kiện kết bạn trên Zalo',
            defaults: {
                name: 'Zalo Friend Trigger',
            },
            inputs: [],
            outputs: ['main'],
            webhooks: [
                {
                    name: 'default',
                    httpMethod: 'POST',
                    responseMode: 'onReceived',
                    path: 'webhook',
                },
            ],
            credentials: [
                {
                    name: 'zaloApi',
                    required: true,
                    displayName: 'Zalo Credential to connect with',
                },
            ],
            properties: [
                {
                    displayName: 'Event Types',
                    name: 'eventTypes',
                    type: 'multiOptions',
                    options: [
                        {
                            name: 'Friend Requests',
                            value: zca_js_1.FriendEventType.REQUEST,
                            description: 'Nghe sự kiện yêu cầu kết bạn',
                        }
                    ],
                    default: [zca_js_1.FriendEventType.REQUEST],
                    required: true,
                    description: 'Friend events to listen for',
                },
            ],
        };
        this.webhookMethods = {
            default: {
                async checkExists() {
                    const webhookData = this.getWorkflowStaticData('node');
                    return !!webhookData.isConnected;
                },
                async create() {
                    const credentials = await this.getCredentials('zaloApi');
                    if (!credentials) {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'No credentials found');
                    }
                    try {
                        const cookieFromCred = JSON.parse(credentials.cookie);
                        const imeiFromCred = credentials.imei;
                        const userAgentFromCred = credentials.userAgent;
                        const zalo = new zca_js_1.Zalo();
                        api = await zalo.login({ cookie: cookieFromCred, imei: imeiFromCred, userAgent: userAgentFromCred });
                        if (!api) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'No API instance found. Please make sure to provide valid credentials.');
                        }
                        const webhookUrl = this.getNodeWebhookUrl('default');
                        console.log(webhookUrl);
                        api.listener.on('friend_event', async (event) => {
                            const nodeEventTypes = this.getNodeParameter('eventTypes', 0);
                            if (nodeEventTypes.includes(event.type)) {
                                this.helpers.httpRequest({
                                    method: 'POST',
                                    url: webhookUrl,
                                    body: {
                                        friendEvent: event.data,
                                    },
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                });
                            }
                        });
                        api.listener.start();
                        const webhookData = this.getWorkflowStaticData('node');
                        webhookData.isConnected = true;
                        webhookData.eventTypes = this.getNodeParameter('eventTypes', 0);
                        return true;
                    }
                    catch (error) {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Zalo connection failed');
                    }
                },
                async delete() {
                    const webhookData = this.getWorkflowStaticData('node');
                    if (api) {
                        api.listener.stop();
                        api = undefined;
                    }
                    if (reconnectTimer) {
                        clearTimeout(reconnectTimer);
                        reconnectTimer = undefined;
                    }
                    delete webhookData.isConnected;
                    delete webhookData.eventTypes;
                    return true;
                },
            },
        };
    }
    async webhook() {
        const req = this.getRequestObject();
        const body = req.body;
        console.log(body);
        return {
            workflowData: [this.helpers.returnJsonArray(req.body)],
        };
    }
}
exports.ZaloFriendTrigger = ZaloFriendTrigger;
//# sourceMappingURL=ZaloFriendTrigger.node.js.map