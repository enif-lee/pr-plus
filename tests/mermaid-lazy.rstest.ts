import { describe, expect, test } from '@rstest/core';
import { __resetMermaidLazyForTests, initMermaid } from '../src/modal/lib/mermaid-lazy';

describe('initMermaid', () => {
  test('uses a concrete font for sequence diagrams', () => {
    __resetMermaidLazyForTests();
    let config: any;
    initMermaid({ initialize: (next: any) => (config = next) }, 'neutral');

    expect(config.fontFamily).not.toBe('inherit');
    expect(config.fontFamily).toMatch(/^-apple-system/);
    expect(config.sequence).toEqual({ useMaxWidth: true });
  });
});
