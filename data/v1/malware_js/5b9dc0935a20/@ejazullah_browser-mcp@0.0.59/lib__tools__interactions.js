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
// Scroll to element or position
const scrollTo = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_scroll_to',
        title: 'Scroll to element or position',
        description: 'Scroll to a specific element or coordinate position',
        inputSchema: z.object({
            element: z.string().optional().describe('Human-readable element description (if scrolling to element)'),
            ref: z.string().optional().describe('Element reference (if scrolling to element)'),
            x: z.number().optional().describe('X coordinate to scroll to (if scrolling to position)'),
            y: z.number().optional().describe('Y coordinate to scroll to (if scrolling to position)'),
            behavior: z.enum(['auto', 'smooth']).optional().default('auto').describe('Scroll behavior'),
        }),
        type: 'destructive',
    },
    handle: async (tab, params, response) => {
        try {
            if (params.element && params.ref) {
                // Scroll to element
                const locator = await tab.refLocator({ element: params.element, ref: params.ref });
                await locator.scrollIntoViewIfNeeded();
                response.addCode(`await page.${await generateLocator(locator)}.scrollIntoViewIfNeeded();`);
                response.addResult('Scrolled to element successfully');
            }
            else if (params.x !== undefined && params.y !== undefined) {
                // Scroll to coordinates
                await tab.page.evaluate(({ x, y, behavior }) => {
                    window.scrollTo({ left: x, top: y, behavior });
                }, { x: params.x, y: params.y, behavior: params.behavior });
                response.addCode(`await page.evaluate(() => window.scrollTo({ left: ${params.x}, top: ${params.y}, behavior: '${params.behavior}' }));`);
                response.addResult(`Scrolled to position (${params.x}, ${params.y})`);
            }
            else {
                response.addError('Either provide element+ref OR x+y coordinates');
                return;
            }
            response.setIncludeSnapshot();
        }
        catch (error) {
            response.addError(`Failed to scroll: ${error}`);
        }
    },
});
// Get page scroll position
const getScrollPosition = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_scroll_position',
        title: 'Get scroll position',
        description: 'Get the current scroll position of the page',
        inputSchema: z.object({}),
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const position = await tab.page.evaluate(() => ({
                x: window.scrollX,
                y: window.scrollY,
            }));
            response.addCode(`const position = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));`);
            response.addResult(`Current scroll position: x=${position.x}, y=${position.y}`);
        }
        catch (error) {
            response.addError(`Failed to get scroll position: ${error}`);
        }
    },
});
// Focus on element
const focusElement = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_focus_element',
        title: 'Focus on element',
        description: 'Set focus on a specific element',
        inputSchema: elementSchema,
        type: 'destructive',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = await tab.refLocator(params);
            await locator.focus();
            response.addCode(`await page.${await generateLocator(locator)}.focus();`);
            response.addResult('Element focused successfully');
            response.setIncludeSnapshot();
        }
        catch (error) {
            response.addError(`Failed to focus element: ${error}`);
        }
    },
});
// Blur (remove focus from) element
const blurElement = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_blur_element',
        title: 'Remove focus from element',
        description: 'Remove focus from a specific element',
        inputSchema: elementSchema,
        type: 'destructive',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = await tab.refLocator(params);
            await locator.blur();
            response.addCode(`await page.${await generateLocator(locator)}.blur();`);
            response.addResult('Element blurred successfully');
            response.setIncludeSnapshot();
        }
        catch (error) {
            response.addError(`Failed to blur element: ${error}`);
        }
    },
});
// Double click
const doubleClick = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_double_click',
        title: 'Double click element',
        description: 'Perform a double click on an element',
        inputSchema: elementSchema,
        type: 'destructive',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = await tab.refLocator(params);
            await tab.waitForCompletion(async () => {
                await locator.dblclick();
            });
            response.addCode(`await page.${await generateLocator(locator)}.dblclick();`);
            response.addResult('Double click performed successfully');
            response.setIncludeSnapshot();
        }
        catch (error) {
            response.addError(`Failed to double click: ${error}`);
        }
    },
});
// Right click (context menu)
const rightClick = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_right_click',
        title: 'Right click element',
        description: 'Perform a right click on an element to open context menu',
        inputSchema: elementSchema,
        type: 'destructive',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = await tab.refLocator(params);
            await tab.waitForCompletion(async () => {
                await locator.click({ button: 'right' });
            });
            response.addCode(`await page.${await generateLocator(locator)}.click({ button: 'right' });`);
            response.addResult('Right click performed successfully');
            response.setIncludeSnapshot();
        }
        catch (error) {
            response.addError(`Failed to right click: ${error}`);
        }
    },
});
export default [
    scrollTo,
    getScrollPosition,
    focusElement,
    blurElement,
    doubleClick,
    rightClick,
];
