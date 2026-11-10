const MDN_BASE = "https://developer.mozilla.org/en-US/docs";
const JAVASCRIPT_BASE = `${MDN_BASE}/Web/JavaScript/Reference/Global_Objects`;
const WEB_API_BASE = `${MDN_BASE}/Web/API`;

function makeLinks(names, base) {
  return Object.fromEntries(names.map((name) => [name, `${base}/${name}`]));
}

const javascriptBuiltins = [
  "AggregateError",
  "Array",
  "ArrayBuffer",
  "AsyncDisposableStack",
  "AsyncFunction",
  "AsyncGenerator",
  "AsyncGeneratorFunction",
  "AsyncIterator",
  "Atomics",
  "BigInt",
  "BigInt64Array",
  "BigUint64Array",
  "Boolean",
  "DataView",
  "Date",
  "DisposableStack",
  "Error",
  "EvalError",
  "FinalizationRegistry",
  "Float16Array",
  "Float32Array",
  "Float64Array",
  "Function",
  "Generator",
  "GeneratorFunction",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Intl",
  "Iterator",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "Proxy",
  "RangeError",
  "ReferenceError",
  "Reflect",
  "RegExp",
  "Set",
  "SharedArrayBuffer",
  "String",
  "SuppressedError",
  "Symbol",
  "SyntaxError",
  "Temporal",
  "TypeError",
  "TypedArray",
  "URIError",
  "Uint8Array",
  "Uint8ClampedArray",
  "Uint16Array",
  "Uint32Array",
  "WeakMap",
  "WeakRef",
  "WeakSet"
];

const internationalizationTypes = [
  "Collator",
  "DateTimeFormat",
  "DisplayNames",
  "DurationFormat",
  "ListFormat",
  "Locale",
  "NumberFormat",
  "PluralRules",
  "RelativeTimeFormat",
  "Segmenter"
];

const webApiTypes = [
  "AbortController",
  "AbortSignal",
  "Animation",
  "AnimationEffect",
  "AudioContext",
  "AudioNode",
  "AudioParam",
  "Blob",
  "BroadcastChannel",
  "Cache",
  "CanvasGradient",
  "CanvasPattern",
  "CanvasRenderingContext2D",
  "CSSStyleDeclaration",
  "Crypto",
  "CryptoKey",
  "CustomEvent",
  "DOMException",
  "DOMMatrix",
  "DOMPoint",
  "DOMRect",
  "DOMRectReadOnly",
  "Document",
  "DocumentFragment",
  "Element",
  "Event",
  "EventTarget",
  "File",
  "FileList",
  "FileReader",
  "FormData",
  "Headers",
  "History",
  "HTMLCanvasElement",
  "HTMLElement",
  "HTMLImageElement",
  "ImageBitmap",
  "ImageData",
  "IntersectionObserver",
  "KeyframeEffect",
  "Location",
  "MediaStream",
  "MediaStreamTrack",
  "MessageChannel",
  "MessagePort",
  "MutationObserver",
  "Navigator",
  "Node",
  "NodeList",
  "OffscreenCanvas",
  "Path2D",
  "Performance",
  "PerformanceEntry",
  "PerformanceObserver",
  "ReadableStream",
  "ReadableStreamDefaultController",
  "ReadableStreamDefaultReader",
  "Request",
  "ResizeObserver",
  "Response",
  "Selection",
  "Storage",
  "SubtleCrypto",
  "TextDecoder",
  "TextEncoder",
  "TransformStream",
  "URL",
  "URLPattern",
  "URLSearchParams",
  "WebSocket",
  "Window",
  "Worker",
  "WritableStream",
  "XMLHttpRequest"
];

const primitiveTypes = {
  bigint: `${JAVASCRIPT_BASE}/BigInt`,
  boolean: `${JAVASCRIPT_BASE}/Boolean`,
  function: `${JAVASCRIPT_BASE}/Function`,
  null: `${JAVASCRIPT_BASE}/null`,
  number: `${JAVASCRIPT_BASE}/Number`,
  object: `${MDN_BASE}/Web/JavaScript/Guide/Data_structures#objects`,
  string: `${JAVASCRIPT_BASE}/String`,
  symbol: `${JAVASCRIPT_BASE}/Symbol`,
  undefined: `${JAVASCRIPT_BASE}/undefined`
};

const globalValues = {
  Infinity: `${JAVASCRIPT_BASE}/Infinity`,
  NaN: `${JAVASCRIPT_BASE}/NaN`,
  globalThis: `${JAVASCRIPT_BASE}/globalThis`,
  undefined: `${JAVASCRIPT_BASE}/undefined`
};

const internationalizationLinks = Object.fromEntries(
  internationalizationTypes.map((name) => [
    `Intl.${name}`,
    `${JAVASCRIPT_BASE}/Intl/${name}`
  ])
);

/**
 * Exact type-name links for JavaScript built-ins and Web API interfaces.
 * Keep this registry local so documentation builds do not need network access.
 */
const exactMdnTypeLinks = {
  ...makeLinks(javascriptBuiltins, JAVASCRIPT_BASE),
  ...internationalizationLinks,
  ...makeLinks(webApiTypes, WEB_API_BASE),
  ...primitiveTypes,
  ...globalValues
};

export const mdnTypeLinks = Object.freeze({
  ...exactMdnTypeLinks,
  ...Object.fromEntries(
    Object.entries(exactMdnTypeLinks).map(([name, route]) => [`globalThis.${name}`, route])
  )
});
