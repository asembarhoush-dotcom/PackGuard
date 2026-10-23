/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { z } from 'zod';
import { defineTool } from './tool.js';
import * as playwright from 'playwright';
import { contextFactory } from '../browserContextFactory.js';
// Connect to a browser via CDP endpoint
const connectCDP = defineTool({
    capability: 'core',
    schema: {
        name: 'browser_connect_cdp',
        title: 'Connect to browser via CDP',
        description: 'Connect to an existing browser instance using Chrome DevTools Protocol (CDP) endpoint',
        inputSchema: z.object({
            endpoint: z.string().describe('CDP endpoint URL (e.g., "ws://localhost:9222" or "wss://example.com/devtools/sessionid"  or "http://localhost:9222")'),
            timeout: z.number().optional().default(30000).describe('Connection timeout in milliseconds'),
        }),
        type: 'destructive',
    },
    handle: async (context, params, response) => {
        try {
            // Ensure endpoint format - don't modify if it already has a valid scheme
            let cdpEndpoint = params.endpoint;
            if (!cdpEndpoint.startsWith('ws://') &&
                !cdpEndpoint.startsWith('wss://') &&
                !cdpEndpoint.startsWith('http://') &&
                !cdpEndpoint.startsWith('https://')) {
                cdpEndpoint = `ws://${cdpEndpoint}`;
            }
            response.addResult(`Connecting to CDP endpoint: ${cdpEndpoint}`);
            // Connect to the browser via CDP
            const browser = await playwright.chromium.connectOverCDP(cdpEndpoint, {
                timeout: params.timeout,
            });
            // Get browser info
            const version = browser.version();
            const contexts = browser.contexts();
            response.addResult(`✅ Successfully connected to browser!`);
            response.addResult(`Browser version: ${version}`);
            response.addResult(`Active contexts: ${contexts.length}`);
            // Update the context configuration to use this CDP connection
            context.config.browser.cdpEndpoint = cdpEndpoint;
            // Switch to CDP mode by updating the browser context factory
            const newContextFactory = contextFactory(context.config);
            await context.updateBrowserContextFactory(newContextFactory);
            response.addCode(`// Browser connected via CDP
const browser = await playwright.chromium.connectOverCDP('${cdpEndpoint}');
console.log('Connected to:', browser.version());`);
            // List available pages/tabs
            if (contexts.length > 0) {
                const pages = contexts[0].pages();
                response.addResult(`Available pages: ${pages.length}`);
                for (let i = 0; i < Math.min(pages.length, 5); i++) {
                    const page = pages[i];
                    const url = page.url();
                    const title = await page.title().catch(() => 'Unknown');
                    response.addResult(`  [${i}] ${title} - ${url}`);
                }
                if (pages.length > 5) {
                    response.addResult(`  ... and ${pages.length - 5} more pages`);
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            response.addError(`Failed to connect to CDP endpoint: ${errorMessage}`);
            if (errorMessage.includes('ECONNREFUSED')) {
                response.addResult(`\n💡 Troubleshooting tips:`);
                response.addResult(`1. Make sure Chrome/Chromium is running with --remote-debugging-port=9222`);
                response.addResult(`2. Start Chrome with: chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0`);
                response.addResult(`3. Check if the endpoint is accessible: curl ${params.endpoint}/json/version`);
            }
            throw error;
        }
    },
});
// Get CDP endpoints from running browsers
const getCDPEndpoints = defineTool({
    capability: 'core',
    schema: {
        name: 'browser_get_cdp_endpoints',
        title: 'Get available CDP endpoints',
        description: 'Discover available Chrome DevTools Protocol endpoints from running browsers',
        inputSchema: z.object({
            port: z.number().optional().default(9222).describe('CDP port to check (default: 9222)'),
            host: z.string().optional().default('localhost').describe('Host to check (default: localhost)'),
        }),
        type: 'readOnly',
    },
    handle: async (context, params, response) => {
        try {
            const baseUrl = `http://${params.host}:${params.port}`;
            response.addResult(`Checking for CDP endpoints at ${baseUrl}`);
            // Try to fetch the version info
            const versionResponse = await fetch(`${baseUrl}/json/version`);
            if (!versionResponse.ok) {
                throw new Error(`No CDP server found at ${baseUrl}`);
            }
            const versionInfo = await versionResponse.json();
            response.addResult(`✅ Found CDP server!`);
            response.addResult(`Browser: ${versionInfo.Browser}`);
            response.addResult(`User-Agent: ${versionInfo['User-Agent']}`);
            response.addResult(`WebSocket URL: ${versionInfo.webSocketDebuggerUrl}`);
            // Get list of pages/targets
            const pagesResponse = await fetch(`${baseUrl}/json`);
            const pages = await pagesResponse.json();
            response.addResult(`\nAvailable targets: ${pages.length}`);
            pages.forEach((page, index) => {
                response.addResult(`[${index}] ${page.type}: ${page.title || 'Untitled'}`);
                response.addResult(`    URL: ${page.url}`);
                response.addResult(`    WebSocket: ${page.webSocketDebuggerUrl}`);
                response.addResult('');
            });
            response.addCode(`// To connect to this CDP endpoint:
await client.callTool({
  name: 'browser_connect_cdp',
  arguments: { endpoint: '${baseUrl}' }
});`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            response.addError(`Failed to discover CDP endpoints: ${errorMessage}`);
            response.addResult(`\n💡 To start a browser with CDP enabled:`);
            response.addResult(`Chrome: google-chrome --remote-debugging-port=${params.port} --remote-debugging-address=0.0.0.0`);
            response.addResult(`Chromium: chromium --remote-debugging-port=${params.port} --remote-debugging-address=0.0.0.0`);
            response.addResult(`Edge: msedge --remote-debugging-port=${params.port} --remote-debugging-address=0.0.0.0`);
        }
    },
});
// Disconnect from CDP
const disconnectCDP = defineTool({
    capability: 'core',
    schema: {
        name: 'browser_disconnect_cdp',
        title: 'Disconnect from CDP',
        description: 'Disconnect from the current CDP connection and return to normal browser mode',
        inputSchema: z.object({}),
        type: 'destructive',
    },
    handle: async (context, params, response) => {
        if (!context.config.browser.cdpEndpoint) {
            response.addResult('ℹ️ No active CDP connection to disconnect from');
            return;
        }
        const previousEndpoint = context.config.browser.cdpEndpoint;
        // Clear the CDP endpoint
        context.config.browser.cdpEndpoint = undefined;
        response.addResult(`✅ Disconnected from CDP endpoint: ${previousEndpoint}`);
        response.addResult('Browser will now use normal launch mode for new connections');
    },
});
export const cdpTools = [
    connectCDP,
    getCDPEndpoints,
    disconnectCDP,
];
