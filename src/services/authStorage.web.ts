// Expo Router also evaluates web routes in Node.js. Keep this module entirely
// free of React Native AsyncStorage so the server bundle cannot call `window`.
const getLocalStorage = (): Storage | null => {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return null;
  }

  return globalThis.localStorage;
};

export const authStorage = {
  getItem: async (key: string) => getLocalStorage()?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => {
    getLocalStorage()?.setItem(key, value);
  },
  removeItem: async (key: string) => {
    getLocalStorage()?.removeItem(key);
  },
};
