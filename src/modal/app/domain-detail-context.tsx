/**
 * Host-data-first: domain detail is the host projection prop.
 * Context lets deep trees read detail without prop drilling when wired.
 */
import React, { createContext, useContext } from 'react';

export type DomainDetail = Record<string, any> | null | undefined;

const DomainDetailContext = createContext<DomainDetail>(null);

export function DomainDetailProvider({
  detail,
  children,
}: {
  detail: DomainDetail;
  children: React.ReactNode;
}) {
  return (
    <DomainDetailContext.Provider value={detail ?? null}>
      {children}
    </DomainDetailContext.Provider>
  );
}

export function useDomainDetail(): DomainDetail {
  return useContext(DomainDetailContext);
}
