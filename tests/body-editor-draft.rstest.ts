import { describe, expect, test } from '@rstest/core';
import { adoptIncomingBodyDraft } from '../src/modal/views/composers/BodyEditor';

describe('adoptIncomingBodyDraft', () => {
  test('adopts host body while draft still matches previous value', () => {
    expect(adoptIncomingBodyDraft('', '', 'hello')).toBe('hello');
    expect(adoptIncomingBodyDraft('a', 'a', 'b')).toBe('b');
  });

  test('keeps in-progress edits across host patches', () => {
    expect(adoptIncomingBodyDraft('orig', 'orig\n\nmark', 'orig')).toBe(
      'orig\n\nmark'
    );
  });
});
