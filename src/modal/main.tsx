/**
 * Vite IIFE entry for the PR modal bundle (MV3 content script).
 * Exposes globalThis.mountPrModal + PRModalApp for pr-modal-host.js.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import yaml from 'highlight.js/lib/languages/yaml';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

import './styles.css';
import { PrModalApp } from './app/PrModalApp';
import { mountPrModal } from './app/mountPrModal';
import * as sessionViewApi from './lib/session-view';
import * as uriRouteApi from './lib/uri-route';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('python', python);
hljs.registerLanguage('yaml', yaml);
marked.setOptions({ gfm: true, breaks: true });

// Expose for pure render helpers that still look at globals
(globalThis as any).hljs = hljs;
(globalThis as any).marked = marked;
(globalThis as any).DOMPurify = DOMPurify;
(globalThis as any).mermaid = mermaid;
(globalThis as any).React = React;
(globalThis as any).ReactDOM = { createRoot };

(globalThis as any).PRModalApp = PrModalApp;
(globalThis as any).mountPrModal = mountPrModal;
// Host restore + deep-link (no chrome.* required; fixture-safe)
(globalThis as any).PRModalSessionView = sessionViewApi;
(globalThis as any).PRModalUriRoute = uriRouteApi;

export { PrModalApp, mountPrModal };
