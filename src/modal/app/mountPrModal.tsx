import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrModalApp } from './PrModalApp';

export function mountPrModal(hostEl, props) {
  let root = hostEl.__prpReactRoot;
  if (!root) {
    root = createRoot(hostEl);
    hostEl.__prpReactRoot = root;
  }
  root.render(React.createElement(PrModalApp, props));
  return {
    render(nextProps) {
      root.render(React.createElement(PrModalApp, nextProps));
    },
    unmount() {
      try {
        root.unmount();
      } catch {
        /* ignore */
      }
      delete hostEl.__prpReactRoot;
    },
  };
}
