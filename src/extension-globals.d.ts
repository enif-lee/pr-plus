
declare const chrome: any;
declare function importScripts(...urls: string[]): void;

interface Error {
  status?: number;
  code?: string;
  pullNumber?: number;
  graphqlErrors?: any;
}

interface GlobalThis {
  chrome?: any;
  PRTree?: any;
  PRTreeDOM?: any;
  PRTreeFetch?: any;
  PRTreeStorage?: any;
  PRTreeBridge?: any;
  PRTreeBootstrap?: any;
  PRGithubEndpoints?: any;
  PRModalDetailStore?: any;
  PRModalLoadProgress?: any;
  PRModalPageEmbed?: any;
  PRModalDetailCache?: any;
  PRModalDetailIdb?: any;
  PRModalFloatingScrollbar?: any;
  PrModalApp?: any;
}

declare var globalThis: GlobalThis;
declare var module: any;
declare var require: any;
declare var Buffer: any;
