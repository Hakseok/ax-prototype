// Loads JSON files from public/mock. The browser fetches them; tests swap in a file reader.

export type JsonReader = (path: string) => Promise<unknown>;

const fetchReader: JsonReader = async (path) => {
  const res = await fetch(`${import.meta.env.BASE_URL}mock/${path}`);
  if (!res.ok) throw new Error(`mock/${path}: ${res.status}`);
  return res.json();
};

let reader: JsonReader = fetchReader;
const cache = new Map<string, Promise<unknown>>();

export const setJsonReader = (next: JsonReader): void => {
  reader = next;
  cache.clear();
};

/** Read and cache one mock file. Files never change at runtime. */
export const readJson = <T>(path: string): Promise<T> => {
  let p = cache.get(path);
  if (!p) {
    p = reader(path);
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return p as Promise<T>;
};
