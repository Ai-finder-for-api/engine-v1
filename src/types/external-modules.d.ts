declare module "lz4js" {
  const lz4: {
    compress(input: Uint8Array): Uint8Array | number[];
    decompress(input: Uint8Array): Uint8Array | number[];
  };
  export default lz4;
}

declare module "three/examples/jsm/loaders/GLTFLoader.js" {
  import * as THREE from "three";

  export class GLTFLoader {
    load(
      url: string,
      onLoad: (gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (event: unknown) => void
    ): void;
  }
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
  import * as THREE from "three";

  export class OrbitControls {
    constructor(camera: THREE.Camera, domElement: HTMLElement);
    target: THREE.Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    minDistance: number;
    maxDistance: number;
    update(): void;
    dispose(): void;
  }
}
