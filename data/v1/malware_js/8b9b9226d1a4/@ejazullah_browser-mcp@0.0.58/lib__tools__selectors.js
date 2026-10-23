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
// Schema for CSS selector based operations
const cssSelectorSchema = z.object({
    selector: z.string().describe('CSS selector to target the element (e.g., "#id", ".class", "button", "[data-test=\'value\']")'),
    attribute: z.string().optional().describe('Optional attribute to get instead of text content (e.g., "href", "src", "value")'),
    index: z.number().optional().describe('Index of element if multiple elements match (0-based)'),
});
// Schema for XPath selector based operations
const xpathSelectorSchema = z.object({
    xpath: z.string().describe('XPath expression to target the element (e.g., "//button[@id=\'submit\']", "//div[contains(@class, \'content\')]")'),
    attribute: z.string().optional().describe('Optional attribute to get instead of text content (e.g., "href", "src", "value")'),
});
// Schema for text-based locators
const textSelectorSchema = z.object({
    text: z.string().describe('Text content to search for in elements'),
    elementType: z.string().optional().describe('Element type to filter by (e.g., "button", "a", "div")'),
    exact: z.boolean().optional().default(false).describe('Whether to match text exactly or use contains'),
    attribute: z.string().optional().describe('Optional attribute to get instead of text content'),
});
// Schema for role-based locators (accessibility)
const roleSelectorSchema = z.object({
    role: z.string().describe('ARIA role of the element (e.g., "button", "link", "textbox", "heading")'),
    name: z.string().optional().describe('Accessible name of the element'),
    level: z.number().optional().describe('Level for headings (1-6)'),
    attribute: z.string().optional().describe('Optional attribute to get instead of text content'),
});
const getTextByCSS = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_text_by_css',
        title: 'Get text by CSS selector',
        description: 'Get text content or attribute from element using CSS selector',
        inputSchema: cssSelectorSchema,
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            let locator = tab.page.locator(params.selector);
            // If index is specified and multiple elements might match
            if (params.index !== undefined) {
                locator = locator.nth(params.index);
            }
            let result;
            if (params.attribute) {
                result = await locator.getAttribute(params.attribute) || '';
                response.addCode(`const attributeValue = await page.locator('${params.selector}')${params.index !== undefined ? `.nth(${params.index})` : ''}.getAttribute('${params.attribute}');`);
            }
            else {
                result = await locator.textContent() || '';
                response.addCode(`const textContent = await page.locator('${params.selector}')${params.index !== undefined ? `.nth(${params.index})` : ''}.textContent();`);
            }
            response.addResult(`${params.attribute ? `Attribute "${params.attribute}"` : 'Text content'}: ${result}`);
        }
        catch (error) {
            response.addError(`Failed to get ${params.attribute ? `attribute "${params.attribute}"` : 'text content'} using CSS selector "${params.selector}": ${error}`);
        }
    },
});
const getTextByXPath = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_text_by_xpath',
        title: 'Get text by XPath',
        description: 'Get text content or attribute from element using XPath expression',
        inputSchema: xpathSelectorSchema,
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = tab.page.locator(`xpath=${params.xpath}`);
            let result;
            if (params.attribute) {
                result = await locator.getAttribute(params.attribute) || '';
                response.addCode(`const attributeValue = await page.locator('xpath=${params.xpath}').getAttribute('${params.attribute}');`);
            }
            else {
                result = await locator.textContent() || '';
                response.addCode(`const textContent = await page.locator('xpath=${params.xpath}').textContent();`);
            }
            response.addResult(`${params.attribute ? `Attribute "${params.attribute}"` : 'Text content'}: ${result}`);
        }
        catch (error) {
            response.addError(`Failed to get ${params.attribute ? `attribute "${params.attribute}"` : 'text content'} using XPath "${params.xpath}": ${error}`);
        }
    },
});
const getTextByText = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_text_by_text',
        title: 'Get text by text content',
        description: 'Find element by its text content and get text or attribute',
        inputSchema: textSelectorSchema,
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            let locator;
            if (params.elementType) {
                // Filter by element type first
                if (params.exact) {
                    locator = tab.page.locator(params.elementType).filter({ hasText: new RegExp(`^${params.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
                }
                else {
                    locator = tab.page.locator(params.elementType).filter({ hasText: params.text });
                }
            }
            else {
                // Search in all elements
                if (params.exact) {
                    locator = tab.page.getByText(params.text, { exact: true });
                }
                else {
                    locator = tab.page.getByText(params.text);
                }
            }
            let result;
            if (params.attribute) {
                result = await locator.getAttribute(params.attribute) || '';
                response.addCode(`const attributeValue = await page.${params.elementType ? `locator('${params.elementType}').filter({ hasText: '${params.text}' })` : `getByText('${params.text}'${params.exact ? ', { exact: true }' : ''})`}.getAttribute('${params.attribute}');`);
            }
            else {
                result = await locator.textContent() || '';
                response.addCode(`const textContent = await page.${params.elementType ? `locator('${params.elementType}').filter({ hasText: '${params.text}' })` : `getByText('${params.text}'${params.exact ? ', { exact: true }' : ''})`}.textContent();`);
            }
            response.addResult(`${params.attribute ? `Attribute "${params.attribute}"` : 'Text content'}: ${result}`);
        }
        catch (error) {
            response.addError(`Failed to get ${params.attribute ? `attribute "${params.attribute}"` : 'text content'} for element with text "${params.text}": ${error}`);
        }
    },
});
const getTextByRole = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_text_by_role',
        title: 'Get text by ARIA role',
        description: 'Get text content or attribute from element using ARIA role',
        inputSchema: roleSelectorSchema,
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            let locator;
            if (params.role === 'heading' && params.level) {
                locator = tab.page.getByRole('heading', { level: params.level, name: params.name });
            }
            else if (params.name) {
                locator = tab.page.getByRole(params.role, { name: params.name });
            }
            else {
                locator = tab.page.getByRole(params.role);
            }
            let result;
            if (params.attribute) {
                result = await locator.getAttribute(params.attribute) || '';
                response.addCode(`const attributeValue = await page.getByRole('${params.role}'${params.name ? `, { name: '${params.name}' }` : ''}${params.level ? `, { level: ${params.level} }` : ''}).getAttribute('${params.attribute}');`);
            }
            else {
                result = await locator.textContent() || '';
                response.addCode(`const textContent = await page.getByRole('${params.role}'${params.name ? `, { name: '${params.name}' }` : ''}${params.level ? `, { level: ${params.level} }` : ''}).textContent();`);
            }
            response.addResult(`${params.attribute ? `Attribute "${params.attribute}"` : 'Text content'}: ${result}`);
        }
        catch (error) {
            response.addError(`Failed to get ${params.attribute ? `attribute "${params.attribute}"` : 'text content'} for ${params.role} element: ${error}`);
        }
    },
});
// Tool to get all text from multiple elements
const getAllText = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_all_text',
        title: 'Get all text from multiple elements',
        description: 'Get text content from all elements matching a CSS selector',
        inputSchema: z.object({
            selector: z.string().describe('CSS selector to target multiple elements'),
            attribute: z.string().optional().describe('Optional attribute to get instead of text content'),
            limit: z.number().optional().default(10).describe('Maximum number of elements to process'),
        }),
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const locator = tab.page.locator(params.selector);
            const count = await locator.count();
            const limit = Math.min(count, params.limit || 10);
            const results = [];
            for (let i = 0; i < limit; i++) {
                const elementLocator = locator.nth(i);
                let result;
                if (params.attribute) {
                    result = await elementLocator.getAttribute(params.attribute) || '';
                }
                else {
                    result = await elementLocator.textContent() || '';
                }
                if (result.trim()) {
                    results.push(`[${i}] ${result}`);
                }
            }
            response.addCode(`const elements = await page.locator('${params.selector}').all();\nconst results = await Promise.all(elements.slice(0, ${limit}).map(el => el.${params.attribute ? `getAttribute('${params.attribute}')` : 'textContent()'}));`);
            response.addResult(`Found ${count} elements, showing first ${limit}:\n${results.join('\n')}`);
        }
        catch (error) {
            response.addError(`Failed to get ${params.attribute ? `attribute "${params.attribute}"` : 'text content'} from elements matching "${params.selector}": ${error}`);
        }
    },
});
export default [
    getTextByCSS,
    getTextByXPath,
    getTextByText,
    getTextByRole,
    getAllText,
];
