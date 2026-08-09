/**
 * Reaction toggle id routing (GraphQL reactable vs REST database id).
 */
import { describe, expect, test } from '@rstest/core';
import {
  isReactableGraphqlId,
  restReactionCommentId,
} from '../src/fetch/reactions';

describe('isReactableGraphqlId', () => {
  test('accepts comment/issue reactable prefixes', () => {
    expect(isReactableGraphqlId('PRRC_kwDOTe7KcM8AAAABMnjV9w')).toBe(true);
    expect(isReactableGraphqlId('IC_kwDOTe7KcM8AAAABM4T4rw')).toBe(true);
    expect(isReactableGraphqlId('I_kwDOTe7KcM70RJJt')).toBe(true);
    expect(isReactableGraphqlId('PR_kwDOTe7KcM70RJJt')).toBe(true);
  });

  test('rejects REST database ids and review threads', () => {
    expect(isReactableGraphqlId('3628817385')).toBe(false);
    expect(isReactableGraphqlId(3628817385)).toBe(false);
    expect(isReactableGraphqlId('PRRT_kwDOTe7KcM4A')).toBe(false);
    expect(isReactableGraphqlId('shell:PRRT_kwDOTe7KcM4A')).toBe(false);
    expect(isReactableGraphqlId('rest-thread-123')).toBe(false);
    expect(isReactableGraphqlId('')).toBe(false);
    expect(isReactableGraphqlId(null)).toBe(false);
  });
});

describe('restReactionCommentId', () => {
  test('keeps numeric database ids only', () => {
    expect(restReactionCommentId('3628817385')).toBe('3628817385');
    expect(restReactionCommentId(3628817385)).toBe('3628817385');
  });

  test('rejects GraphQL global ids as REST path segments', () => {
    expect(restReactionCommentId('PRRC_kwDOTe7KcM8AAAABMnjV9w')).toBeNull();
    expect(restReactionCommentId('IC_kwDOxxx')).toBeNull();
  });
});
