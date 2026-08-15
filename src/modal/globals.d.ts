/** Ambient globals available in the content-script modal bundle. */
declare const hljs: {
  highlight: (code: string, opts: { language: string; ignoreIllegals?: boolean }) => { value: string };
  highlightAuto: (code: string) => { value: string };
  getLanguage?: (name: string) => unknown;
};

declare const marked:
  | ((src: string) => string)
  | { parse: (src: string) => string; setOptions?: (o: object) => void };

declare const DOMPurify: { sanitize: (html: string) => string };

declare const mermaid: {
  initialize: (cfg: object) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

interface Window {
  mountPrModal?: (el: HTMLElement, props: unknown) => unknown;
  PRModalApp?: unknown;
  PRTreeFetch?: Record<string, (...args: any[]) => Promise<any>>;
}

interface HTMLElement {
  __prpReactRoot?: {
    render: (node: unknown) => void;
    unmount: () => void;
  };
}
