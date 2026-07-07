
export interface SavedProject {
  id: string;
  name: string;
  timestamp: number;
  conditionsCount?: number;
  data: any; // Waveform data (conditions array)
  topology?: {
    nodes: any[];
    linkMatrix: number[][];
    longMatrix: number[][];
    machineList: number[];
    nodeCount: string;
    measurementCount: string;
  };
}

const DB_NAME = 'WaveformAnalyzerDB';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

let broadcast: { postMessage: (msg: any) => void; onmessage?: ((evt: any) => void) | null } | null = null;
try {
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('project_storage_channel');
    broadcast = {
      postMessage: (msg: any) => channel.postMessage(msg),
      set onmessage(cb: any) {
        channel.onmessage = cb;
      },
      get onmessage() {
        return channel.onmessage;
      }
    };
  }
} catch (e) {
  console.warn('BroadcastChannel not supported or allowed in this context:', e);
}

const localListeners: (() => void)[] = [];

export const onProjectUpdate = (callback: () => void) => {
  localListeners.push(callback);
  if (broadcast) {
    broadcast.onmessage = (event) => {
      if (event.data && event.data.type === 'PROJECT_UPDATED') {
        callback();
      }
    };
  }
};

const notifyUpdate = () => {
  if (broadcast) {
    try {
      broadcast.postMessage({ type: 'PROJECT_UPDATED' });
    } catch (e) {
      console.warn('Failed to broadcast project update:', e);
    }
  }
  // Always trigger local listeners directly so same-tab UI updates instantly
  localListeners.forEach(cb => {
    try {
      cb();
    } catch (err) {
      console.error('Error executing project update listener:', err);
    }
  });
};

export const saveProject = async (project: SavedProject) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(project);
    request.onsuccess = () => {
      notifyUpdate();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

export const getAllProjects = async (): Promise<SavedProject[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getAllProjectsMetadata = async (): Promise<Omit<SavedProject, 'data'>[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const results: Omit<SavedProject, 'data'>[] = [];
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const { id, name, timestamp, conditionsCount } = cursor.value;
        results.push({ id, name, timestamp, conditionsCount });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const getProjectById = async (id: string): Promise<SavedProject | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

export const deleteProject = async (id: string) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => {
      notifyUpdate();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteProjects = async (ids: string[]) => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    ids.forEach(id => {
      store.delete(id);
    });
    transaction.oncomplete = () => {
      notifyUpdate();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getStorageEstimate = async () => {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  }
  return null;
};
