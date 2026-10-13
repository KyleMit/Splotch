// Stand-ins for expo-media-library and the expo-file-system staging calls behind
// experiments/native-architecture/src/platform/photoLibrary.ts. A test mocks each module id
// to the matching export and reads what the save did from `photos`.
export const photos = {
  os: 'ios',
  androidApi: 33,
  permission: 'granted',
  permissionRequests: [],
  created: [],
  createError: null,
  onCreate: null,
  files: new Map(),
  deleted: [],
  reset() {
    this.os = 'ios';
    this.androidApi = 33;
    this.permission = 'granted';
    this.permissionRequests.length = 0;
    this.created.length = 0;
    this.createError = null;
    this.onCreate = null;
    this.files.clear();
    this.deleted.length = 0;
  },
};

export const reactNativeModule = {
  Platform: {
    get OS() {
      return photos.os;
    },
    get Version() {
      return photos.androidApi;
    },
  },
};

function record(entry) {
  photos.created.push({ ...entry, base64: photos.files.get(entry.filePath) });
  photos.onCreate?.();
  if (photos.createError) throw photos.createError;
}

export const mediaLibraryModule = {
  async requestPermissionsAsync(...args) {
    photos.permissionRequests.push(args);
    const granted = photos.permission === 'granted';
    return { granted, status: photos.permission, canAskAgain: true, expires: 'never' };
  },
  Asset: {
    async create(filePath, album) {
      record({ via: 'Asset.create', filePath, album });
      return { id: `asset-${photos.created.length}` };
    },
  },
  Album: {
    async create(name, assetRefs, moveAssets) {
      if (assetRefs.length !== 1 || moveAssets !== undefined)
        throw new Error('Expected one file path and the default move choice');
      record({ via: 'Album.create', filePath: assetRefs[0], album: name });
      return { id: `album-${name}` };
    },
  },
};

function joined(parts) {
  return parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
}

class Directory {
  constructor(...parts) {
    this.uri = joined(parts);
  }
  create() {}
}

class File {
  constructor(...parts) {
    this.uri = joined(parts);
  }
  get exists() {
    return photos.files.has(this.uri);
  }
  delete() {
    photos.deleted.push(this.uri);
    photos.files.delete(this.uri);
  }
}

export const fileSystemModule = {
  Directory,
  File,
  Paths: { cache: 'cache', document: 'document' },
};

export const legacyFilesModule = {
  EncodingType: { Base64: 'base64' },
  async writeAsStringAsync(uri, contents, options) {
    if (options?.encoding !== 'base64') throw new Error('Expected a base64 write');
    photos.files.set(uri, contents);
  },
};
