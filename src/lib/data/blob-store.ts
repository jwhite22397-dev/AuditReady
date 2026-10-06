export interface StoredBlob {
  data: ArrayBuffer;
  type: string;
}

export interface BlobStore {
  put(id: string, data: ArrayBuffer, type: string): Promise<void>;
  get(id: string): Promise<StoredBlob | null>;
  clear(): Promise<void>;
}

export class MemoryBlobStore implements BlobStore {
  private readonly records = new Map<string, StoredBlob>();

  async put(id: string, data: ArrayBuffer, type: string): Promise<void> {
    this.records.set(id, { data, type });
  }

  async get(id: string): Promise<StoredBlob | null> {
    return this.records.get(id) ?? null;
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

export class IndexedDbBlobStore implements BlobStore {
  private readonly name = "auditready";
  private readonly store = "files";

  async put(id: string, data: ArrayBuffer, type: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.store, "readwrite");
      tx.objectStore(this.store).put({ id, data, type });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not store the file."));
    });
    db.close();
  }

  async get(id: string): Promise<StoredBlob | null> {
    const db = await this.open();
    const result = await new Promise<StoredBlob | null>((resolve, reject) => {
      const tx = db.transaction(this.store, "readonly");
      const request = tx.objectStore(this.store).get(id);
      request.onsuccess = () => {
        const value = request.result as StoredBlob | undefined;
        resolve(value ? { data: value.data, type: value.type } : null);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read the file."));
    });
    db.close();
    return result;
  }

  async clear(): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.store, "readwrite");
      tx.objectStore(this.store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not clear files."));
    });
    db.close();
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.store)) db.createObjectStore(this.store, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open local file storage."));
    });
  }
}

export function createBlobStore(): BlobStore {
  if (typeof indexedDB === "undefined") return new MemoryBlobStore();
  return new IndexedDbBlobStore();
}
