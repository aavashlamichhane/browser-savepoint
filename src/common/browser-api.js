const rawApi = globalThis.browser ?? globalThis.chrome;

if (!rawApi) {
  throw new Error("Browser extension API not found.");
}

const callApi = (fn, context, ...args) =>
  new Promise((resolve, reject) => {
    try {
      const maybePromise = fn.apply(context, [...args, (result) => {
        const lastError = rawApi.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(result);
      }]);

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve).catch(reject);
      }
    } catch (error) {
      reject(error);
    }
  });

export const extApi = {
  runtime: rawApi.runtime,
  extension: {
    isAllowedIncognitoAccess: () =>
      callApi(rawApi.extension.isAllowedIncognitoAccess, rawApi.extension)
  },
  tabs: {
    query: (queryInfo) => callApi(rawApi.tabs.query, rawApi.tabs, queryInfo),
    create: (createProperties) => callApi(rawApi.tabs.create, rawApi.tabs, createProperties)
  },
  windows: {
    getCurrent: (getInfo = {}) => callApi(rawApi.windows.getCurrent, rawApi.windows, getInfo)
  },
  downloads: {
    download: (options) => callApi(rawApi.downloads.download, rawApi.downloads, options)
  },
  storage: {
    localGet: (keys) => callApi(rawApi.storage.local.get, rawApi.storage.local, keys),
    localSet: (items) => callApi(rawApi.storage.local.set, rawApi.storage.local, items),
    localRemove: (keys) => callApi(rawApi.storage.local.remove, rawApi.storage.local, keys)
  }
};
