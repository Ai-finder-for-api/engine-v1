const DB_NAME = "quantum-forge-runtime";
const STORE_NAME = "toolchain";
const RECORD_ID = "x64-v1";

export interface ToolchainBinary {
  name: string;
  bytes: Uint8Array;
}

export interface InstalledToolchain {
  id: string;
  architecture: "x64";
  installedAt: number;
  binaries: ToolchainBinary[];
}

type StoredToolchain = {
  id: string;
  architecture: "x64";
  installedAt: number;
  binaries: Array<{ name: string; bytes: ArrayBuffer }>;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

function seededBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let value = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    out[i] = value & 0xff;
  }
  return out;
}

async function fetchOrGenerateBinaries(): Promise<ToolchainBinary[]> {
  await new Promise((resolve) => setTimeout(resolve, 450));
  return [
    { name: "qforge-compiler-x64.bin", bytes: seededBytes(768 * 1024, 0x9a31f0e1) },
    { name: "qforge-linker-x64.bin", bytes: seededBytes(420 * 1024, 0x148bb123) },
    { name: "qforge-shaderpack-x64.bin", bytes: seededBytes(520 * 1024, 0x71af33c4) },
  ];
}

async function writeToDirectory(handle: FileSystemDirectoryHandle, binaries: ToolchainBinary[]) {
  for (const binary of binaries) {
    const fileHandle = await handle.getFileHandle(binary.name, { create: true });
    const writable = await fileHandle.createWritable();
    const safeBytes = new Uint8Array(binary.bytes.byteLength);
    safeBytes.set(binary.bytes);
    await writable.write(safeBytes as FileSystemWriteChunkType);
    await writable.close();
  }
}

export async function getInstalledToolchain(): Promise<InstalledToolchain | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(RECORD_ID);
    request.onsuccess = () => {
      const result = request.result as StoredToolchain | undefined;
      if (!result) {
        resolve(null);
        return;
      }
      resolve({
        id: result.id,
        architecture: result.architecture,
        installedAt: result.installedAt,
        binaries: result.binaries.map((item) => ({
          name: item.name,
          bytes: toUint8Array(item.bytes),
        })),
      });
    };
    request.onerror = () => reject(request.error ?? new Error("Failed reading toolchain"));
  });
}

export async function installToolchainOnce(directory?: FileSystemDirectoryHandle): Promise<InstalledToolchain> {
  const existing = await getInstalledToolchain();
  if (existing) {
    if (directory) {
      await writeToDirectory(directory, existing.binaries);
    }
    return existing;
  }

  const binaries = await fetchOrGenerateBinaries();
  const record: StoredToolchain = {
    id: RECORD_ID,
    architecture: "x64",
    installedAt: Date.now(),
    binaries: binaries.map((item) => ({
      name: item.name,
      bytes: new Uint8Array(item.bytes).buffer,
    })),
  };

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed saving toolchain"));
  });

  if (directory) {
    await writeToDirectory(directory, binaries);
  }

  return {
    id: record.id,
    architecture: record.architecture,
    installedAt: record.installedAt,
    binaries,
  };
}

export async function selectInstallDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === "undefined" || !("showDirectoryPicker" in window)) {
    return null;
  }

  const picker = window as Window & {
    showDirectoryPicker: (options?: { mode?: "read" | "readwrite"; id?: string }) => Promise<FileSystemDirectoryHandle>;
  };
  return picker.showDirectoryPicker({ mode: "readwrite", id: "quantum-forge-x64" });
}
