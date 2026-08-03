/**
 * Conversation virtual scroller → body renderers (Markdown / Mermaid).
 * isScrolling mirrors prp-is-scrolling (700ms idle debounce).
 */
import React, { createContext, useContext, useMemo } from 'react';

export type ConversationScrollIdleValue = {
  /** True while the conversation virtual list is in an active scroll gesture. */
  isScrolling: boolean;
};

const defaultValue: ConversationScrollIdleValue = { isScrolling: false };

export const ConversationScrollIdleContext =
  createContext<ConversationScrollIdleValue>(defaultValue);

export function ConversationScrollIdleProvider({
  isScrolling,
  children,
}: {
  isScrolling: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ isScrolling: Boolean(isScrolling) }),
    [isScrolling]
  );
  return (
    <ConversationScrollIdleContext.Provider value={value}>
      {children}
    </ConversationScrollIdleContext.Provider>
  );
}

/** Safe for non-conversation surfaces (composer preview, Diff) — idle default. */
export function useConversationScrollIdle(): ConversationScrollIdleValue {
  return useContext(ConversationScrollIdleContext) || defaultValue;
}
