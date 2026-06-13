import lz4 from "lz4js";
import { ZstdInit, type ZstdCodec } from "@oneidentity/zstd-js";

const MAGIC = "QGAMEFMT";
const HEADER_BYTES = 64;
const ENTRY_BYTES = 64;
const ALIGNMENT_BYTES = 64;

const encoder = new TextEncoder();

export type SectionType =
  | "bytecode"
  | "ecsGraph"
  | "bvhTree"
  | "voxelNaniteGeometry"
  | "rawAudio"
  | "vfxStateMachine";

export type CompressionMode = "none" | "lz4" | "zstd";

type CompressionId = 0 | 1 | 2;

const sectionTypeToId: Record<SectionType, number> = {
  bytecode: 1,
  ecsGraph: 2,
  bvhTree: 3,
  voxelNaniteGeometry: 4,
  rawAudio: 5,
  vfxStateMachine: 6,
};

const sectionIdToType: Record<number, SectionType> = {
  1: "bytecode",
  2: "ecsGraph",
  3: "bvhTree",
  4: "voxelNaniteGeometry",
  5: "rawAudio",
  6: "vfxStateMachine",
};

const compressionToId: Record<CompressionMode, CompressionId> = {
  none: 0,
  lz4: 1,
  zstd: 2,
};

const compressionIdToName: Record<number, CompressionMode> = {
  0: "none",
  1: "lz4",
  2: "zstd",
};

type SamplePayload = Record<SectionType, Uint8Array>;

interface SerializedSection {
  type: SectionType;
  compression: CompressionMode;
  rawBytes: Uint8Array;
  storedBytes: Uint8Array;
  checksum: bigint;
  offset: number;
}

export interface ParsedSection {
  type: SectionType;
  compression: CompressionMode;
  offset: number;
  storedBytes: number;
  rawBytes: number;
  checksum: bigint;
  payload: Uint8Array;
}

export interface ParsedGameFile {
  header: {
    version: number;
    sectionCount: number;
    buildUnixMs: bigint;
    payloadBytes: bigint;
  };
  sections: ParsedSection[];
}

let zstdSimplePromise: Promise<{ compress: (source: Uint8Array, level?: number) => Uint8Array; decompress: (source: Uint8Array) => Uint8Array; }> | null = null;

function align64(value: number): number {
  return (value + (ALIGNMENT_BYTES - 1)) & ~(ALIGNMENT_BYTES - 1);
}

function writeAscii(view: Uint8Array, offset: number, text: string): void {
  view.set(encoder.encode(text), offset);
}

function hashFnv1a64(data: Uint8Array): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < data.length; i += 1) {
    hash ^= BigInt(data[i]);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
}

async function getZstdSimple() {
  if (!zstdSimplePromise) {
    zstdSimplePromise = ZstdInit().then((codec: ZstdCodec) => ({
      compress: codec.ZstdSimple.compress,
      decompress: codec.ZstdSimple.decompress,
    }));
  }
  return zstdSimplePromise;
}

async function compress(mode: CompressionMode, payload: Uint8Array): Promise<Uint8Array> {
  if (mode === "none") return payload;
  if (mode === "lz4") {
    return Uint8Array.from(lz4.compress(payload));
  }

  const zstdSimple = await getZstdSimple();
  return zstdSimple.compress(payload, 3);
}

async function decompress(mode: CompressionMode, payload: Uint8Array): Promise<Uint8Array> {
  if (mode === "none") return payload;
  if (mode === "lz4") {
    return Uint8Array.from(lz4.decompress(payload));
  }

  const zstdSimple = await getZstdSimple();
  return zstdSimple.decompress(payload);
}

export async function serializeGameFile(
  payload: SamplePayload,
  compressionPlan: Partial<Record<SectionType, CompressionMode>> = {}
): Promise<Uint8Array> {
  const sectionOrder: SectionType[] = [
    "bytecode",
    "ecsGraph",
    "bvhTree",
    "voxelNaniteGeometry",
    "rawAudio",
    "vfxStateMachine",
  ];

  const serializedSections: SerializedSection[] = [];
  for (const type of sectionOrder) {
    const rawBytes = payload[type];
    const compression = compressionPlan[type] ?? "none";
    const storedBytes = await compress(compression, rawBytes);
    serializedSections.push({
      type,
      compression,
      rawBytes,
      storedBytes,
      checksum: hashFnv1a64(rawBytes),
      offset: 0,
    });
  }

  const sectionCount = serializedSections.length;
  const tocOffset = HEADER_BYTES;
  const tocBytes = align64(sectionCount * ENTRY_BYTES);
  const payloadOffset = align64(tocOffset + tocBytes);

  let writeCursor = payloadOffset;
  for (const section of serializedSections) {
    writeCursor = align64(writeCursor);
    section.offset = writeCursor;
    writeCursor += section.storedBytes.byteLength;
  }
  const totalBytes = align64(writeCursor);

  const artifact = new Uint8Array(totalBytes);
  const view = new DataView(artifact.buffer);
  writeAscii(artifact, 0, MAGIC);
  view.setUint16(8, 1, true);
  view.setUint16(10, sectionCount, true);
  view.setUint32(12, ALIGNMENT_BYTES, true);
  view.setBigUint64(16, BigInt(tocOffset), true);
  view.setBigUint64(24, BigInt(tocBytes), true);
  view.setBigUint64(32, BigInt(payloadOffset), true);
  view.setBigUint64(40, BigInt(totalBytes - payloadOffset), true);
  view.setBigUint64(48, BigInt(Date.now()), true);
  view.setBigUint64(56, 0n, true);

  serializedSections.forEach((section, index) => {
    const base = tocOffset + index * ENTRY_BYTES;
    view.setUint16(base, sectionTypeToId[section.type], true);
    view.setUint8(base + 2, compressionToId[section.compression]);
    view.setUint8(base + 3, 0);
    view.setUint32(base + 4, Number(section.checksum & 0xffffffffn), true);
    view.setBigUint64(base + 8, BigInt(section.offset), true);
    view.setBigUint64(base + 16, BigInt(section.storedBytes.byteLength), true);
    view.setBigUint64(base + 24, BigInt(section.rawBytes.byteLength), true);
    view.setBigUint64(base + 32, section.checksum, true);
    view.setBigUint64(base + 40, 0n, true);
    view.setInt32(base + 48, index === 0 ? -1 : index - 1, true);
    view.setUint16(base + 52, index, true);
    view.setUint16(base + 54, 0, true);
    view.setBigUint64(base + 56, 0n, true);

    artifact.set(section.storedBytes, section.offset);
  });

  return artifact;
}

export async function parseGameFile(binary: Uint8Array): Promise<ParsedGameFile> {
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const signature = new TextDecoder().decode(binary.subarray(0, 8));
  if (signature !== MAGIC) {
    throw new Error(`Invalid .game signature: ${signature}`);
  }

  const version = view.getUint16(8, true);
  const sectionCount = view.getUint16(10, true);
  const tocOffset = Number(view.getBigUint64(16, true));
  const buildUnixMs = view.getBigUint64(48, true);
  const payloadBytes = view.getBigUint64(40, true);

  const sections: ParsedSection[] = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const base = tocOffset + index * ENTRY_BYTES;
    const typeId = view.getUint16(base, true);
    const compressionId = view.getUint8(base + 2);
    const offset = Number(view.getBigUint64(base + 8, true));
    const storedBytes = Number(view.getBigUint64(base + 16, true));
    const rawBytes = Number(view.getBigUint64(base + 24, true));
    const checksum = view.getBigUint64(base + 32, true);
    const type = sectionIdToType[typeId];
    const compression = compressionIdToName[compressionId];
    if (!type || !compression) {
      throw new Error(`Unknown section metadata at entry ${index}`);
    }

    const storedView = binary.subarray(offset, offset + storedBytes);
    const payload = await decompress(compression, storedView);
    if (payload.byteLength !== rawBytes) {
      throw new Error(`Section ${type} failed length validation`);
    }

    sections.push({
      type,
      compression,
      offset,
      storedBytes,
      rawBytes,
      checksum,
      payload,
    });
  }

  return {
    header: {
      version,
      sectionCount,
      buildUnixMs,
      payloadBytes,
    },
    sections,
  };
}

export function createSampleGamePayload(): SamplePayload {
  const packedText = (label: string, rows: number) => {
    const lines: string[] = [];
    for (let i = 0; i < rows; i += 1) {
      lines.push(`${label}:${i.toString().padStart(4, "0")}:${Math.sin(i).toFixed(7)}`);
    }
    return encoder.encode(lines.join("\n"));
  };

  const voxelBuffer = new Uint8Array(64 * 1024);
  for (let i = 0; i < voxelBuffer.length; i += 1) {
    voxelBuffer[i] = (i * 17 + (i >>> 3)) % 256;
  }

  const rawAudio = new Uint8Array(96 * 1024);
  for (let i = 0; i < rawAudio.length; i += 1) {
    rawAudio[i] = Math.floor((Math.sin(i * 0.075) * 0.5 + 0.5) * 255);
  }

  return {
    bytecode: packedText("bc.x64|bc.arm64|bc.wasm", 800),
    ecsGraph: packedText("ecs:node->component->children", 1200),
    bvhTree: packedText("bvh:split|aabb|min|max|leaf", 900),
    voxelNaniteGeometry: voxelBuffer,
    rawAudio,
    vfxStateMachine: packedText("vfx:emitter|burst|curve|noise", 1400),
  };
}
