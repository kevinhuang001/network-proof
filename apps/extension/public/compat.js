/*
 * Compatibility floor, loader-level and deliberately old-fashioned.
 *
 * This file is copied verbatim by Vite (it lives in `public/`) and loaded as a classic
 * script BEFORE the application bundle. That is the point: it is not transpiled, so it
 * cannot itself depend on the features it is installing, and it runs before any module
 * body evaluates. Written in ES5 on purpose — no arrow functions, no `const`, no
 * template literals.
 *
 * Why: this app is meant to run on an old Android phone, offline, forever. Android 9
 * shipped with WebView 69, and a device that is kept offline never receives the Play
 * Store updates that would move it forward. The bundler downlevels syntax to WebView 67,
 * which is as low as the build can honestly go — the wallet's arithmetic is BigInt, and
 * BigInt arrived in 67 with no polyfill. Everything newer than that is either avoided,
 * shimmed here, or detected here so the stylesheet can fall back.
 *
 * Two kinds of gap are handled:
 *   1. Runtime APIs that postdate WebView 69. Shims below.
 *   2. Layout features that postdate it and cannot be shimmed in JS — flexbox `gap` and
 *      `aspect-ratio` — which are detected here so the stylesheet can fall back.
 *
 * Nothing here touches cryptography. The wallet's security does not rest on this file;
 * it rests on @noble/@scure and on the device never being online.
 */
(function () {
  'use strict';

  var root = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this;

  /* WebView 71. */
  if (typeof root.globalThis === 'undefined') {
    try {
      root.globalThis = root;
    } catch (error) {
      /* Non-fatal: the bundle only reads crypto off it. */
    }
  }

  /* WebView 93. Used by the CBOR decoder to reject duplicate map keys. */
  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      value: function hasOwn(target, key) {
        return Object.prototype.hasOwnProperty.call(target, key);
      },
      writable: true,
      configurable: true,
    });
  }

  /* WebView 73. */
  if (typeof Object.fromEntries !== 'function') {
    Object.fromEntries = function fromEntries(entries) {
      var out = {};
      var list = Array.from(entries);
      for (var i = 0; i < list.length; i++) out[list[i][0]] = list[i][1];
      return out;
    };
  }

  /* WebView 71. Used by React's scheduler; falls back to a resolved promise. */
  if (typeof root.queueMicrotask !== 'function') {
    root.queueMicrotask = function queueMicrotask(callback) {
      Promise.resolve().then(callback);
    };
  }

  /* WebView 71/69. */
  if (typeof Array.prototype.flat !== 'function') {
    Object.defineProperty(Array.prototype, 'flat', {
      value: function flat(depth) {
        var levels = typeof depth === 'number' ? depth : 1;
        return levels < 1
          ? Array.prototype.slice.call(this)
          : Array.prototype.reduce.call(
              this,
              function (acc, value) {
                return acc.concat(Array.isArray(value) ? flat.call(value, levels - 1) : value);
              },
              [],
            );
      },
      writable: true,
      configurable: true,
    });
  }
  if (typeof Array.prototype.flatMap !== 'function') {
    Object.defineProperty(Array.prototype, 'flatMap', {
      value: function flatMap(callback, thisArg) {
        return Array.prototype.map.call(this, callback, thisArg).flat();
      },
      writable: true,
      configurable: true,
    });
  }

  /* WebView 92. Used to index into word/source lists. */
  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      value: function at(index) {
        var length = this.length >>> 0;
        var offset = Math.trunc(index) || 0;
        if (offset < 0) offset += length;
        return offset < 0 || offset >= length ? undefined : this[offset];
      },
      writable: true,
      configurable: true,
    });
  }

  /* WebView 85. */
  if (typeof String.prototype.replaceAll !== 'function') {
    Object.defineProperty(String.prototype, 'replaceAll', {
      value: function replaceAll(search, replacement) {
        if (search instanceof RegExp) {
          if (!search.global) throw new TypeError('replaceAll requires a global RegExp');
          return this.replace(search, replacement);
        }
        return this.split(String(search)).join(String(replacement));
      },
      writable: true,
      configurable: true,
    });
  }

  /* WebView 73/85. */
  if (typeof Promise.allSettled !== 'function') {
    Promise.allSettled = function allSettled(promises) {
      return Promise.all(
        Array.from(promises).map(function (promise) {
          return Promise.resolve(promise).then(
            function (value) {
              return { status: 'fulfilled', value: value };
            },
            function (reason) {
              return { status: 'rejected', reason: reason };
            },
          );
        }),
      );
    };
  }
  if (typeof Promise.any !== 'function') {
    Promise.any = function any(promises) {
      return new Promise(function (resolve, reject) {
        var list = Array.from(promises);
        var pending = list.length;
        if (pending === 0) return reject(new Error('All promises were rejected'));
        var errors = [];
        list.forEach(function (promise, index) {
          Promise.resolve(promise).then(resolve, function (reason) {
            errors[index] = reason;
            if (--pending === 0) reject(new Error('All promises were rejected'));
          });
        });
      });
    };
  }

  /*
   * Layout detection.
   *
   * `@supports` cannot answer the flexbox-gap question: WebView 69 does support `gap`
   * in grid containers, so `@supports (gap: 1px)` reports true while a flex container
   * quietly ignores it. Measuring is the only honest test.
   */
  var html = document.documentElement;

  function flexGapSupported() {
    var probe = document.createElement('div');
    probe.style.cssText = 'display:flex;flex-direction:column;row-gap:10px;position:absolute;top:-9999px;';
    probe.appendChild(document.createElement('div'));
    probe.appendChild(document.createElement('div'));
    document.body.appendChild(probe);
    var supported = probe.scrollHeight === 10 || probe.offsetHeight === 10;
    document.body.removeChild(probe);
    return supported;
  }

  try {
    if (!flexGapSupported()) html.className += ' np-no-flex-gap';
  } catch (error) {
    /* Measurement failed; assume the modern behaviour rather than mis-style the app. */
  }

  /* WebView 88. Without it the camera box needs a padding-based square fallback. */
  var supports = typeof CSS !== 'undefined' && CSS.supports ? CSS.supports.bind(CSS) : null;
  try {
    if (!supports || !supports('aspect-ratio', '1 / 1')) html.className += ' np-no-aspect-ratio';
  } catch (error) {
    html.className += ' np-no-aspect-ratio';
  }
})();
