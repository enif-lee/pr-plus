import React from 'react';
import { createRoot } from 'react-dom/client';
import { PrModalApp } from './PrModalApp';

class MountErrorBoundary extends React.Component<
  { hostEl: HTMLElement; children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    try {
      this.props.hostEl.setAttribute(
        'data-prp-react-err',
        String(error?.message || error).slice(0, 400)
      );
    } catch {
      /* ignore */
    }
    console.error('[pr+] PrModalApp render error', error);
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        'div',
        {
          className: 'prp-overlay prp-mount-error',
          'data-prp-mount-error': '1',
          style: {
            padding: 16,
            color: '#f85149',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
          },
        },
        'pr+ failed to render: ',
        String(this.state.error?.message || this.state.error),
        '\n',
        String(this.state.error?.stack || '')
      );
    }
    return this.props.children;
  }
}

function renderApp(root: { render: (node: React.ReactNode) => void }, hostEl: HTMLElement, props: any) {
  try {
    hostEl.setAttribute(
      'data-prp-mount-props',
      `open=${String(!!props?.open)};detail=${String(!!props?.detail)};keys=${Object.keys(props || {}).length}`
    );
  } catch {
    /* ignore */
  }
  root.render(
    React.createElement(MountErrorBoundary, {
      hostEl,
      children: React.createElement(PrModalApp, props),
    })
  );
}

export function mountPrModal(hostEl: any, props: any) {
  let root = hostEl.__prpReactRoot;
  if (!root) {
    root = createRoot(hostEl);
    hostEl.__prpReactRoot = root;
  }
  renderApp(root, hostEl, props);
  return {
    render(nextProps: any) {
      renderApp(root, hostEl, nextProps);
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
