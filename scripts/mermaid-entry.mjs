/**
 * ESM entry for the lazy-loaded Mermaid chunk (content-script import via
 * chrome.runtime.getURL). Keep separate from the main IIFE so modal open stays
 * small until a ```mermaid fence is actually rendered.
 */
import mermaid from 'mermaid';
export default mermaid;
