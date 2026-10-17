export * from './types';
export * from './time';
export * from './loaders';
export { setJsonReader, readJson } from './reader';

/** Site selection value that stands for the whole company. */
export const COMPANY = 'ALL';

/** Sites a user may see, in the given order. */
export const permittedSites = (user: { sites: string[] }, all: string[]): string[] => all.filter((s) => user.sites.includes(s));
