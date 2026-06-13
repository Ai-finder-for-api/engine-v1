# QGAMEFMT v1 Binary Specification

## Header (64 bytes, little endian)

| Offset | Size | Type | Field |
|---|---:|---|---|
| 0 | 8 | char[8] | Magic: `QGAMEFMT` |
| 8 | 2 | u16 | Version (`1`) |
| 10 | 2 | u16 | Section count |
| 12 | 4 | u32 | Alignment bytes (`64`) |
| 16 | 8 | u64 | TOC absolute offset |
| 24 | 8 | u64 | TOC byte span |
| 32 | 8 | u64 | Payload absolute offset |
| 40 | 8 | u64 | Payload byte span |
| 48 | 8 | u64 | Build unix milliseconds |
| 56 | 8 | u64 | Reserved |

All major regions are aligned to 64 bytes.

## TOC Entry (64 bytes each)

| Offset | Size | Type | Field |
|---|---:|---|---|
| 0 | 2 | u16 | Section type id |
| 2 | 1 | u8 | Compression (`0=none`,`1=lz4`,`2=zstd`) |
| 3 | 1 | u8 | Architecture mask |
| 4 | 4 | u32 | Low hash for quick reject |
| 8 | 8 | u64 | Payload absolute offset |
| 16 | 8 | u64 | Stored bytes |
| 24 | 8 | u64 | Raw bytes |
| 32 | 8 | u64 | FNV1a-64 checksum |
| 40 | 8 | u64 | Reserved |
| 48 | 4 | i32 | Parent index (`-1` root) |
| 52 | 2 | u16 | Depth |
| 54 | 2 | u16 | Stream flags |
| 56 | 8 | u64 | Reserved |

## Section Type IDs

1. `bytecode`
2. `ecsGraph`
3. `bvhTree`
4. `voxelNaniteGeometry`
5. `rawAudio`
6. `vfxStateMachine`

## Zero-Copy Rules

1. Uncompressed sections are consumed using `Uint8Array.subarray` / pointer slicing.
2. Compressed sections are decompressed into pooled staging pages.
3. No schema transforms are allowed in decode pass; readers map data in place.

## Streaming Contract

1. TOC is parsed first and is always contiguous.
2. Readers can issue ordered chunk requests using payload offsets.
3. ECS and BVH streams are required to preserve parent-before-child ordering.
