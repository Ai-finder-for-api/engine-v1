from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Dict, List


def pack_texture(source: bytes) -> bytes:
    return bytes((byte ^ 0x5A) for byte in source)


def pack_waveform(source: bytes) -> bytes:
    output = bytearray()
    run_value = None
    run_count = 0
    for byte in source:
        if run_value is None:
            run_value = byte
            run_count = 1
            continue
        if byte == run_value and run_count < 255:
            run_count += 1
        else:
            output.extend((run_count, run_value))
            run_value = byte
            run_count = 1
    if run_value is not None:
        output.extend((run_count, run_value))
    return bytes(output)


def bake_asset(path: Path, out_dir: Path) -> Dict[str, str | int]:
    source = path.read_bytes()
    if path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
        packed = pack_texture(source)
    elif path.suffix.lower() in {".wav", ".pcm"}:
        packed = pack_waveform(source)
    else:
        packed = source

    digest = hashlib.sha256(packed).hexdigest()
    out_path = out_dir / f"{path.stem}.{digest[:8]}.bin"
    out_path.write_bytes(packed)
    return {
        "source": str(path),
        "target": str(out_path),
        "bytes": len(packed),
        "sha256": digest,
    }


def run(input_dir: Path, out_dir: Path) -> List[Dict[str, str | int]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    assets = [
        path
        for path in input_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".wav", ".pcm", ".json", ".obj"}
    ]
    results = [bake_asset(path, out_dir) for path in assets]
    manifest = out_dir / "manifest.json"
    manifest.write_text(json.dumps(results, indent=2), encoding="utf-8")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Quantum Forge asset baking pipeline")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    results = run(args.input, args.output)
    print(json.dumps({"assets": len(results), "output": str(args.output)}, indent=2))


if __name__ == "__main__":
    main()
