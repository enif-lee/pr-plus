/**
 * Shared conversation view bag (hooks live in ConversationView; render modules read this).
 */
import React, { createContext, useContext } from 'react';

export const ConversationBagContext = createContext<any>(null);

export function useConversationBag() {
  const v = useContext(ConversationBagContext);
  if (!v) throw new Error('useConversationBag outside provider');
  return v;
}
