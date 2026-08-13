/** @module modal/lib/line-selection */
/**
 * Pure helpers for GitHub-style single- and multi-line diff selection
 * and review-comment payload shaping.
 *
 * Split: line-selection-nav / line-selection-range / line-selection-payload.
 * This file re-exports the public API (build-pure entry + app imports).
 */

export * from './line-selection-nav';
export * from './line-selection-range';
export * from './line-selection-payload';
