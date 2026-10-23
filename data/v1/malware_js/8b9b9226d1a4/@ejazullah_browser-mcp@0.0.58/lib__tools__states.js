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
import { defineTabTool } from './tool.js';
import { elementSchema } from './snapshot.js';
import { generateLocator } from './utils.js';
// Check if element is visible
const isVisible = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_is_visible',
        title: 'Check if element is visible',
        description: 'Check if an element is visible on the page',
        inputSchema: elementSchema,
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = await tab.refLocator(params);
            const visible = await locator.isVisible();
            response.addCode(`const isVisible = await page.${await generateLocator(locator)}.isVisible();`);
            response.addResult(`Element is ${visible ? 'visible' : 'not visible'}`);
        }
        catch (error) {
            response.addError(`Failed to check visibility: ${error}`);
        }
    },
});
// Check if element is enabled
const isEnabled = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_is_enabled',
        title: 'Check if element is enabled',
        description: 'Check if an element is enabled (not disabled)',
        inputSchema: elementSchema,
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = await tab.refLocator(params);
            const enabled = await locator.isEnabled();
            response.addCode(`const isEnabled = await page.${await generateLocator(locator)}.isEnabled();`);
            response.addResult(`Element is ${enabled ? 'enabled' : 'disabled'}`);
        }
        catch (error) {
            response.addError(`Failed to check if element is enabled: ${error}`);
        }
    },
});
// Check if checkbox/radio is checked
const isChecked = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_is_checked',
        title: 'Check if checkbox/radio is selected',
        description: 'Check if a checkbox or radio button is checked/selected',
        inputSchema: elementSchema,
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = await tab.refLocator(params);
            const checked = await locator.isChecked();
            response.addCode(`const isChecked = await page.${await generateLocator(locator)}.isChecked();`);
            response.addResult(`Element is ${checked ? 'checked' : 'not checked'}`);
        }
        catch (error) {
            response.addError(`Failed to check if element is checked: ${error}`);
        }
    },
});
// Wait for element to appear/disappear
const waitForElement = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_wait_for_element',
        title: 'Wait for element state',
        description: 'Wait for an element to appear, disappear, or change state',
        inputSchema: elementSchema.extend({
            state: z.enum(['visible', 'hidden', 'attached', 'detached']).default('visible').describe('State to wait for'),
            timeout: z.number().optional().default(5000).describe('Timeout in milliseconds'),
        }),
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = await tab.refLocator(params);
            await locator.waitFor({
                state: params.state,
                timeout: params.timeout
            });
            response.addCode(`await page.${await generateLocator(locator)}.waitFor({ state: '${params.state}', timeout: ${params.timeout} });`);
            response.addResult(`Element is now ${params.state}`);
            if (params.state === 'visible' || params.state === 'attached') {
                response.setIncludeSnapshot();
            }
        }
        catch (error) {
            response.addError(`Failed to wait for element to be ${params.state}: ${error}`);
        }
    },
});
// Count matching elements
const getElementCount = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_element_count',
        title: 'Count elements',
        description: 'Count the number of elements matching a CSS selector',
        inputSchema: z.object({
            selector: z.string().describe('CSS selector to count elements'),
        }),
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = tab.page.locator(params.selector);
            const count = await locator.count();
            response.addCode(`const count = await page.locator('${params.selector}').count();`);
            response.addResult(`Found ${count} elements matching "${params.selector}"`);
        }
        catch (error) {
            response.addError(`Failed to count elements: ${error}`);
        }
    },
});
export default [
    isVisible,
    isEnabled,
    isChecked,
    waitForElement,
    getElementCount,
];
