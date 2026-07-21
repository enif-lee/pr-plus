/**
 * Entry for esbuild IIFE bundle. Loads pure helpers then App.
 * Pure modules are prepended by the build script as globals.
 */

/* App.jsx is bundled after pure modules; globals expected:
 * React, ReactDOM, PRModalLayout, PRModalVirtual, PRModalSearch, PRModalDiffRows
 */
