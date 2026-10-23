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
// Get all links from page
const getAllLinks = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_all_links',
        title: 'Get all links',
        description: 'Extract all links from the current page',
        inputSchema: z.object({
            includeText: z.boolean().optional().default(true).describe('Include link text'),
            includeHref: z.boolean().optional().default(true).describe('Include href attribute'),
            limit: z.number().optional().default(20).describe('Maximum number of links to return'),
        }),
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const links = await tab.page.evaluate(() => {
                const linkElements = Array.from(document.querySelectorAll('a[href]'));
                return linkElements.map((link, index) => ({
                    index,
                    text: link.textContent?.trim() || '',
                    href: link.getAttribute('href') || '',
                    title: link.getAttribute('title') || '',
                }));
            });
            const limitedLinks = links.slice(0, params.limit);
            const results = [];
            limitedLinks.forEach((link) => {
                const parts = [`[${link.index}]`];
                if (params.includeText && link.text) {
                    parts.push(`"${link.text}"`);
                }
                if (params.includeHref) {
                    parts.push(`→ ${link.href}`);
                }
                if (link.title) {
                    parts.push(`(${link.title})`);
                }
                results.push(parts.join(' '));
            });
            response.addCode(`const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(link => ({ text: link.textContent, href: link.href })));`);
            response.addResult(`Found ${links.length} links (showing first ${limitedLinks.length}):\n${results.join('\n')}`);
        }
        catch (error) {
            response.addError(`Failed to get links: ${error}`);
        }
    },
});
// Get all images from page
const getAllImages = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_all_images',
        title: 'Get all images',
        description: 'Extract all images and their sources from the current page',
        inputSchema: z.object({
            includeAlt: z.boolean().optional().default(true).describe('Include alt text'),
            includeSrc: z.boolean().optional().default(true).describe('Include src attribute'),
            limit: z.number().optional().default(20).describe('Maximum number of images to return'),
        }),
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const images = await tab.page.evaluate(() => {
                const imgElements = Array.from(document.querySelectorAll('img'));
                return imgElements.map((img, index) => ({
                    index,
                    src: img.src || '',
                    alt: img.alt || '',
                    title: img.title || '',
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height,
                }));
            });
            const limitedImages = images.slice(0, params.limit);
            const results = [];
            limitedImages.forEach((img) => {
                const parts = [`[${img.index}]`];
                if (params.includeAlt && img.alt) {
                    parts.push(`"${img.alt}"`);
                }
                if (params.includeSrc) {
                    parts.push(`→ ${img.src}`);
                }
                if (img.width && img.height) {
                    parts.push(`(${img.width}x${img.height})`);
                }
                results.push(parts.join(' '));
            });
            response.addCode(`const images = await page.evaluate(() => Array.from(document.querySelectorAll('img')).map(img => ({ src: img.src, alt: img.alt })));`);
            response.addResult(`Found ${images.length} images (showing first ${limitedImages.length}):\n${results.join('\n')}`);
        }
        catch (error) {
            response.addError(`Failed to get images: ${error}`);
        }
    },
});
// Get table data
const getTableData = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_table_data',
        title: 'Extract table data',
        description: 'Extract data from HTML tables',
        inputSchema: z.object({
            selector: z.string().optional().default('table').describe('CSS selector for the table'),
            includeHeaders: z.boolean().optional().default(true).describe('Include table headers'),
            maxRows: z.number().optional().default(10).describe('Maximum number of rows to extract'),
        }),
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const tableData = await tab.page.evaluate(({ selector, includeHeaders, maxRows }) => {
                const table = document.querySelector(selector);
                if (!table)
                    return null;
                const rows = Array.from(table.querySelectorAll('tr'));
                const data = [];
                rows.slice(0, maxRows).forEach((row) => {
                    const cells = Array.from(row.querySelectorAll('td, th'));
                    const rowData = cells.map(cell => cell.textContent?.trim() || '');
                    if (rowData.some(cell => cell)) { // Only include non-empty rows
                        data.push(rowData);
                    }
                });
                return data;
            }, { selector: params.selector, includeHeaders: params.includeHeaders, maxRows: params.maxRows });
            if (!tableData) {
                response.addError(`No table found with selector "${params.selector}"`);
                return;
            }
            const results = [];
            tableData.forEach((row, index) => {
                const isHeader = index === 0 && params.includeHeaders;
                const prefix = isHeader ? 'HEADER' : `ROW ${index}`;
                results.push(`${prefix}: ${row.join(' | ')}`);
            });
            response.addCode(`const tableData = await page.evaluate(() => Array.from(document.querySelector('${params.selector}').querySelectorAll('tr')).map(row => Array.from(row.cells).map(cell => cell.textContent)));`);
            response.addResult(`Table data (${tableData.length} rows):\n${results.join('\n')}`);
        }
        catch (error) {
            response.addError(`Failed to extract table data: ${error}`);
        }
    },
});
// Get computed styles
const getElementStyle = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_element_style',
        title: 'Get element styles',
        description: 'Get computed CSS styles for an element',
        inputSchema: z.object({
            selector: z.string().describe('CSS selector for the element'),
            properties: z.array(z.string()).optional().describe('Specific CSS properties to get (if not provided, gets common ones)'),
        }),
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const defaultProperties = [
                'display', 'visibility', 'opacity', 'position', 'top', 'left', 'width', 'height',
                'margin', 'padding', 'border', 'background-color', 'color', 'font-size', 'font-family'
            ];
            const propertiesToGet = params.properties || defaultProperties;
            const styles = await tab.page.evaluate(({ selector, properties }) => {
                const element = document.querySelector(selector);
                if (!element)
                    return null;
                const computedStyle = window.getComputedStyle(element);
                const result = {};
                properties.forEach((prop) => {
                    result[prop] = computedStyle.getPropertyValue(prop);
                });
                return result;
            }, { selector: params.selector, properties: propertiesToGet });
            if (!styles) {
                response.addError(`No element found with selector "${params.selector}"`);
                return;
            }
            const results = Object.entries(styles)
                .filter(([_, value]) => value && value !== 'auto' && value !== 'none')
                .map(([prop, value]) => `${prop}: ${value}`)
                .join('\n');
            response.addCode(`const styles = await page.evaluate(() => { const el = document.querySelector('${params.selector}'); return window.getComputedStyle(el); });`);
            response.addResult(`Element styles:\n${results}`);
        }
        catch (error) {
            response.addError(`Failed to get element styles: ${error}`);
        }
    },
});
export default [
    getAllLinks,
    getAllImages,
    getTableData,
    getElementStyle,
];
