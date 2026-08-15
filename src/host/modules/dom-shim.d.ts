
interface EventTarget {
  closest?(sel: string): Element | null;
  value?: any;
  focus?(): void;
  select?(): void;
  open?: boolean;
  style?: any;
  type?: string;
  checked?: boolean;
}
interface Element {
  focus(): void;
  select?(): void;
  value?: any;
  style: any;
  type?: string;
  checked?: boolean;
}
interface HTMLElement {
  open?: boolean;
  value?: any;
  select?(): void;
  checked?: boolean;
  type?: string;
  style: any;
}
interface Error {
  status?: number;
  pullNumber?: number;
  code?: string;
}
