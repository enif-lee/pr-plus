/** PRTreeFetch composed proxy */
import { prTreeFetchPartA } from './bridge-fetch-part-a';
import { prTreeFetchPartB } from './bridge-fetch-part-b';

export var PRTreeFetch = {
  ...prTreeFetchPartA,
  ...prTreeFetchPartB,
};
