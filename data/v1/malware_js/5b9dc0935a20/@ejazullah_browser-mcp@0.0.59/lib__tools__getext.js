/**
 * Copyright (c) Microsoft Corpo  handle: async (tab, params, response) => {
    const { ref, element, attribute } = params;
    
    try {
      const locator = await tab.refLocator(params);
      
      let result: string;
      if (attribute) {
        result = await locator.getAttribute(attribute) || '';
        response.addCode(`const attributeValue = await page.${await generateLocator(locator)}.getAttribute('${attribute}');`);
      } else {
        result = await locator.textContent() || '';
        response.addCode(`const textContent = await page.${await generateLocator(locator)}.textContent();`);
      }
      
      response.addResult(`${attribute ? `Attribute "${attribute}"` : 'Text content'}: ${result}`);
    } catch (error) {
      response.addError(`Failed to get ${attribute ? `attribute "${attribute}"` : 'text content'} from element: ${error}`);
    }
  },ed under the Apache License, Version 2.0 (the "License");
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
const getTextSchema = elementSchema.extend({
    attribute: z.string().optional().describe('Optional attribute to get instead of text content (e.g., "href", "src", "value")'),
});
const getText = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_text',
        title: 'Get text content or attribute from element',
        description: 'Get text content or attribute value from a specific element on the page',
        inputSchema: getTextSchema,
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        const { ref, element, attribute } = params;
        try {
            const locator = await tab.refLocator(params);
            let result;
            if (attribute) {
                result = await locator.getAttribute(attribute) || '';
                response.addCode(`const attributeValue = await page.${await generateLocator(locator)}.getAttribute('${attribute}');`);
            }
            else {
                result = await locator.textContent() || '';
                response.addCode(`const textContent = await page.${await generateLocator(locator)}.textContent();`);
            }
            response.addResult(`${attribute ? `Attribute "${attribute}"` : 'Text content'}: ${result}`);
        }
        catch (error) {
            response.addError(`Failed to get ${attribute ? `attribute "${attribute}"` : 'text content'} from element: ${error}`);
        }
    },
});
const getPageInfo = defineTabTool({
    capability: 'core',
    schema: {
        name: 'browser_get_page_info',
        title: 'Get page information',
        description: 'Get basic information about the current page (title, URL, etc.)',
        inputSchema: z.object({}),
        type: 'readOnly',
    },
    handle: async (tab, params, response) => {
        try {
            const title = await tab.page.title();
            const url = tab.page.url();
            const viewport = tab.page.viewportSize();
            response.addCode(`const title = await page.title();
const url = page.url();
const viewport = page.viewportSize();`);
            response.addResult(`Page Information:
- Title: ${title}
- URL: ${url}
- Viewport: ${viewport ? `${viewport.width}x${viewport.height}` : 'Not set'}`);
        }
        catch (error) {
            response.addError(`Failed to get page information: ${error}`);
        }
    },
});
export default [
    getText,
    getPageInfo
];
