/**
 * Vite IIFE entry for the PR modal bundle (MV3 content script).
 * Exposes globalThis.mountPrModal + PRModalApp for pr-modal-host.js.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import hljs from 'highlight.js/lib/core';
/**
 * Language grammars are lazy-loaded ESM chunks (dist/hljs-langs/<id>.js)
 * via ensureHljsLanguage() — not registered here (keeps the main IIFE small).
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import './styles.css';
import { PrModalApp } from './app/PrModalApp';
import { mountPrModal } from './app/mountPrModal';
import * as sessionViewApi from './lib/session-view';
import * as uriRouteApi from './lib/uri-route';
import * as hljsLazy from './lib/hljs-lazy';
import * as mermaidLazy from './lib/mermaid-lazy';
import { configureMarkedCodeHighlight } from './components/common/utils';

marked.setOptions({ gfm: true, breaks: true });
// Fenced ```lang blocks use the same lazy hljs pipeline as Diff lines
configureMarkedCodeHighlight(marked);

// Expose for pure render helpers that still look at globals
(globalThis as any).hljs = hljs;
(globalThis as any).marked = marked;
(globalThis as any).DOMPurify = DOMPurify;
// Mermaid loads on first ```mermaid fence (dist/mermaid.esm.js) — not inlined
(globalThis as any).PRPMermaidLazy = mermaidLazy;
(globalThis as any).React = React;
(globalThis as any).ReactDOM = { createRoot };
(globalThis as any).PRPHljsLazy = hljsLazy;

(globalThis as any).PRModalApp = PrModalApp;
(globalThis as any).mountPrModal = mountPrModal;
// Host restore + deep-link (no chrome.* required; fixture-safe)
(globalThis as any).PRModalSessionView = sessionViewApi;
(globalThis as any).PRModalUriRoute = uriRouteApi;

export { PrModalApp, mountPrModal };
