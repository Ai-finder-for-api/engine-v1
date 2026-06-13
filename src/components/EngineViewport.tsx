import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const BASE_MANNEQUIN_URL = "https://threejs.org/examples/models/gltf/Xbot.glb";

function quatFromEuler(x: number, y: number, z: number): [number, number, number, number] {
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  return [quat.x, quat.y, quat.z, quat.w];
}

function makeQuaternionTrack(nodeName: string, eulers: Array<[number, number, number]>, times: number[]): THREE.QuaternionKeyframeTrack {
  const values: number[] = [];
  for (const [x, y, z] of eulers) {
    values.push(...quatFromEuler(x, y, z));
  }
  return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

function buildBasicWalkClip(root: THREE.Object3D): THREE.AnimationClip | null {
  const times = [0, 0.25, 0.5, 0.75, 1.0];
  const nodesByName = new Map<string, THREE.Object3D>();
  root.traverse((node: THREE.Object3D) => {
    if (node.name) nodesByName.set(node.name.toLowerCase(), node);
  });

  const pickNode = (candidates: string[]): THREE.Object3D | null => {
    for (const candidate of candidates) {
      for (const [name, node] of nodesByName) {
        if (name.includes(candidate)) return node;
      }
    }
    return null;
  };

  const hips = pickNode(["hips", "pelvis", "spine"]);
  const leftUpperLeg = pickNode(["leftupleg", "leftthigh", "thigh_l", "left_leg"]);
  const rightUpperLeg = pickNode(["rightupleg", "rightthigh", "thigh_r", "right_leg"]);
  const leftLowerLeg = pickNode(["leftleg", "leftcalf", "calf_l"]);
  const rightLowerLeg = pickNode(["rightleg", "rightcalf", "calf_r"]);
  const tracks: THREE.KeyframeTrack[] = [];

  if (hips?.name) {
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `${hips.name}.position`,
        times,
        [
          hips.position.x,
          hips.position.y,
          hips.position.z,
          hips.position.x,
          hips.position.y + 0.05,
          hips.position.z,
          hips.position.x,
          hips.position.y,
          hips.position.z,
          hips.position.x,
          hips.position.y + 0.05,
          hips.position.z,
          hips.position.x,
          hips.position.y,
          hips.position.z,
        ]
      )
    );
  }

  if (leftUpperLeg?.name) {
    tracks.push(
      makeQuaternionTrack(
        leftUpperLeg.name,
        [
          [0.5, 0, 0],
          [0.0, 0, 0],
          [-0.5, 0, 0],
          [0.0, 0, 0],
          [0.5, 0, 0],
        ],
        times
      )
    );
  }
  if (rightUpperLeg?.name) {
    tracks.push(
      makeQuaternionTrack(
        rightUpperLeg.name,
        [
          [-0.5, 0, 0],
          [0.0, 0, 0],
          [0.5, 0, 0],
          [0.0, 0, 0],
          [-0.5, 0, 0],
        ],
        times
      )
    );
  }
  if (leftLowerLeg?.name) {
    tracks.push(
      makeQuaternionTrack(
        leftLowerLeg.name,
        [
          [0.2, 0, 0],
          [0.55, 0, 0],
          [0.15, 0, 0],
          [0.05, 0, 0],
          [0.2, 0, 0],
        ],
        times
      )
    );
  }
  if (rightLowerLeg?.name) {
    tracks.push(
      makeQuaternionTrack(
        rightLowerLeg.name,
        [
          [0.15, 0, 0],
          [0.05, 0, 0],
          [0.2, 0, 0],
          [0.55, 0, 0],
          [0.15, 0, 0],
        ],
        times
      )
    );
  }

  if (tracks.length === 0) {
    const target = root.name || "ModelRoot";
    if (!root.name) root.name = target;
    tracks.push(
      new THREE.VectorKeyframeTrack(`${target}.position`, times, [0, 0, 0, 0, 0.05, 0, 0, 0, 0, 0, 0.05, 0, 0, 0, 0])
    );
  }

  return new THREE.AnimationClip("QF_BasicWalk", 1.0, tracks);
}

interface EngineViewportProps {
  modelFile: File | null;
  onStats: (stats: { meshes: number; materials: number; triangles: number }) => void;
  onTextures: (textures: Array<{ name: string; width: number; height: number; previewUrl: string }>) => void;
  onLoadState: (state: { isLoading: boolean; progress: number; message: string }) => void;
  onAnimationData: (data: AnimationSystemData) => void;
  selectedAnimation: string | null;
  isAnimationPlaying: boolean;
  scrubNormalized: number;
  sequence: Array<{ id: string; clipName: string; speed: number; loopCount: number; blendSec: number }>;
}

export interface AnimationClipInfo {
  name: string;
  durationSec: number;
  tracks: number;
  keyframes: number;
  boneTracks: number;
  morphTracks: number;
  transformTracks: number;
  estimatedFps: number;
  channelKinds: string[];
  hasSkeletalTracks: boolean;
}

export interface SkeletonMeta {
  skeletonName: string;
  boneCount: number;
  rootBoneCount: number;
  skinnedMeshCount: number;
  hasInverseBindMatrices: boolean;
  sampleBones: string[];
}

export interface AnimationSystemData {
  clips: AnimationClipInfo[];
  skeletons: SkeletonMeta[];
}

async function createTexturePreview(texture: THREE.Texture): Promise<{ width: number; height: number; previewUrl: string } | null> {
  const source = texture.image as { width?: number; height?: number } | undefined;
  if (!source || !source.width || !source.height) return null;

  const maxPreview = 256;
  const scale = Math.min(1, maxPreview / Math.max(source.width, source.height));
  const width = Math.max(1, Math.floor(source.width * scale));
  const height = Math.max(1, Math.floor(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: false });
  if (!context) return null;

  try {
    context.drawImage(texture.image as CanvasImageSource, 0, 0, width, height);
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve({ width: source.width!, height: source.height!, previewUrl: URL.createObjectURL(blob) });
    }, "image/webp", 0.82);
  });
}

function frameObject(camera: THREE.PerspectiveCamera, controls: OrbitControls, root: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const offset = Math.max(distance * 1.8, 2.5);

  camera.near = Math.max(0.01, offset / 200);
  camera.far = Math.max(2000, offset * 25);
  camera.updateProjectionMatrix();
  camera.position.set(center.x + offset, center.y + offset * 0.45, center.z + offset);

  controls.target.copy(center);
  controls.minDistance = Math.max(offset * 0.15, 0.5);
  controls.maxDistance = offset * 8;
  controls.update();
}

function hasSkinnedMesh(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((object: THREE.Object3D) => {
    const skinned = object as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      found = true;
    }
  });
  return found;
}

export default function EngineViewport({
  modelFile,
  onStats,
  onTextures,
  onLoadState,
  onAnimationData,
  selectedAnimation,
  isAnimationPlaying,
  scrubNormalized,
  sequence,
}: EngineViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRootRef = useRef<THREE.Object3D | null>(null);
  const frameRef = useRef<number>(0);
  const previewUrlsRef = useRef<string[]>([]);
  const placeholderRef = useRef<THREE.Mesh | null>(null);
  const mannequinRef = useRef<THREE.Object3D | null>(null);
  const mannequinReadyRef = useRef(false);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const clipDurationsRef = useRef<Map<string, number>>(new Map());
  const clockRef = useRef(new THREE.Clock());
  const isPlayingRef = useRef(isAnimationPlaying);
  const sequenceRef = useRef(sequence);
  const sequenceRuntimeRef = useRef({ stepIndex: 0, stepElapsed: 0, activeStepId: "" });

  useEffect(() => {
    isPlayingRef.current = isAnimationPlaying;
  }, [isAnimationPlaying]);

  useEffect(() => {
    sequenceRef.current = sequence;
    sequenceRuntimeRef.current = { stepIndex: 0, stepElapsed: 0, activeStepId: "" };
  }, [sequence]);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#09090b");

    const camera = new THREE.PerspectiveCamera(55, mountRef.current.clientWidth / 500, 0.1, 3000);
    camera.position.set(7, 4, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mountRef.current.clientWidth, 500);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.target.set(0, 1, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x101010, 0.9);
    const directional = new THREE.DirectionalLight(0xffffff, 1.3);
    directional.position.set(6, 9, 4);
    scene.add(hemi, directional, new THREE.GridHelper(28, 28, 0x27272a, 0x171717));

    const placeholder = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.8, 0.24, 140, 30),
      new THREE.MeshStandardMaterial({ color: "#7c3aed", roughness: 0.22, metalness: 0.78 })
    );
    placeholder.position.y = 1;
    scene.add(placeholder);
    placeholderRef.current = placeholder;

    const resize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / 500;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, 500);
    };

    const animate = () => {
      const delta = clockRef.current.getDelta();
      if (mixerRef.current && isPlayingRef.current) {
        const activeSequence = sequenceRef.current;
        if (activeSequence.length > 1 && actionsRef.current.size > 0) {
          const runtime = sequenceRuntimeRef.current;
          const step = activeSequence[Math.min(runtime.stepIndex, activeSequence.length - 1)];
          const action = actionsRef.current.get(step.clipName);
          if (action) {
            if (runtime.activeStepId !== step.id) {
              actionsRef.current.forEach((candidate) => {
                if (candidate !== action) {
                  candidate.fadeOut(Math.max(0.01, step.blendSec));
                }
              });
              action.reset();
              action.setEffectiveTimeScale(Math.max(0.1, step.speed));
              action.fadeIn(Math.max(0.01, step.blendSec));
              action.play();
              runtime.activeStepId = step.id;
              runtime.stepElapsed = 0;
            }

            runtime.stepElapsed += delta;
            const clipDuration = clipDurationsRef.current.get(step.clipName) ?? action.getClip().duration;
            const stepDuration = (clipDuration / Math.max(0.1, step.speed)) * Math.max(1, step.loopCount);
            if (runtime.stepElapsed >= stepDuration) {
              runtime.stepElapsed = 0;
              runtime.stepIndex = (runtime.stepIndex + 1) % activeSequence.length;
              runtime.activeStepId = "";
            }
          }
        }
        mixerRef.current.update(delta);
      }
      if (placeholderRef.current) {
        placeholderRef.current.rotation.y += 0.008;
      }
      controls.update();
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);
    animate();

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    const mannequinLoader = new GLTFLoader();
    mannequinLoader.load(
      BASE_MANNEQUIN_URL,
      (gltf: { scene: THREE.Group }) => {
        if (!sceneRef.current) return;
        const mannequin = gltf.scene;
        mannequin.visible = true;
        mannequin.name = "base_mannequin";
        mannequinRef.current = mannequin;
        mannequinReadyRef.current = true;
        sceneRef.current.add(mannequin);

        if (placeholderRef.current) {
          sceneRef.current.remove(placeholderRef.current);
          placeholderRef.current.geometry.dispose();
          const mat = placeholderRef.current.material as THREE.Material;
          mat.dispose();
          placeholderRef.current = null;
        }

        frameObject(camera, controls, mannequin);

        const stats = { meshes: 0, triangles: 0, materials: 0 };
        const materialSet = new Set<string>();
        mannequin.traverse((object: THREE.Object3D) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          stats.meshes += 1;
          if (mesh.geometry.index) {
            stats.triangles += Math.floor(mesh.geometry.index.count / 3);
          } else {
            stats.triangles += Math.floor(mesh.geometry.attributes.position.count / 3);
          }
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat: THREE.Material) => materialSet.add(mat.uuid));
        });
        onStats({ ...stats, materials: materialSet.size });

        const basicWalk = buildBasicWalkClip(mannequin);
        if (basicWalk) {
          const keyframes = basicWalk.tracks.reduce((sum, track) => sum + track.times.length, 0);
          const boneTracks = basicWalk.tracks.filter((track) => track.name.includes(".bones[")).length;
          const morphTracks = basicWalk.tracks.filter((track) => track.name.includes("morphTargetInfluences")).length;
          const transformTracks = basicWalk.tracks.filter(
            (track) => track.name.endsWith(".position") || track.name.endsWith(".quaternion") || track.name.endsWith(".scale")
          ).length;
          const uniqueTimes = new Set<number>();
          basicWalk.tracks.forEach((track) => track.times.forEach((t) => uniqueTimes.add(t)));
          onAnimationData({
            clips: [
              {
                name: basicWalk.name,
                durationSec: basicWalk.duration,
                tracks: basicWalk.tracks.length,
                keyframes,
                boneTracks,
                morphTracks,
                transformTracks,
                estimatedFps: basicWalk.duration > 0 ? uniqueTimes.size / basicWalk.duration : 0,
                channelKinds: ["position", "quaternion"],
                hasSkeletalTracks: boneTracks > 0,
              },
            ],
            skeletons: [],
          });

          const mixer = new THREE.AnimationMixer(mannequin);
          mixerRef.current = mixer;
          const action = mixer.clipAction(basicWalk);
          action.play();
          actionsRef.current.clear();
          actionsRef.current.set(basicWalk.name, action);
          clipDurationsRef.current.clear();
          clipDurationsRef.current.set(basicWalk.name, basicWalk.duration);
        }
        onLoadState({ isLoading: false, progress: 100, message: "Ready (base mannequin + walk)" });
      },
      undefined,
      () => {
        mannequinReadyRef.current = false;
      }
    );

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
      controls.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (!modelFile || !sceneRef.current || !cameraRef.current || !controlsRef.current) return;

    const loader = new GLTFLoader();
    const fileUrl = URL.createObjectURL(modelFile);

    onLoadState({ isLoading: true, progress: 0, message: "Parsing GLB" });
    loader.load(
      fileUrl,
      async (gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }) => {
        URL.revokeObjectURL(fileUrl);
        if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;

        if (modelRootRef.current && modelRootRef.current !== mannequinRef.current) {
          sceneRef.current.remove(modelRootRef.current);
        }
        if (mixerRef.current) {
          mixerRef.current.stopAllAction();
          mixerRef.current = null;
          actionsRef.current.clear();
          clipDurationsRef.current.clear();
        }
        if (placeholderRef.current) {
          sceneRef.current.remove(placeholderRef.current);
          placeholderRef.current.geometry.dispose();
          const mat = placeholderRef.current.material as THREE.Material;
          mat.dispose();
          placeholderRef.current = null;
        }

        const importedRoot = gltf.scene;
        const importedHasSkinnedMesh = hasSkinnedMesh(importedRoot);
        const shouldUseBaseMannequin = gltf.animations.length > 0 && !importedHasSkinnedMesh && mannequinReadyRef.current;

        const root = shouldUseBaseMannequin && mannequinRef.current ? mannequinRef.current : importedRoot;
        if (shouldUseBaseMannequin && mannequinRef.current) {
          mannequinRef.current.visible = true;
          importedRoot.visible = false;
          onLoadState({ isLoading: true, progress: 92, message: "Applying clip to base mannequin" });
        } else {
          if (mannequinRef.current) {
            mannequinRef.current.visible = false;
          }
          sceneRef.current.add(importedRoot);
        }
        modelRootRef.current = root;

        const bounds = new THREE.Box3().setFromObject(root);
        const center = bounds.getCenter(new THREE.Vector3());
        if (!shouldUseBaseMannequin) {
          root.position.sub(center);
          root.position.y += Math.max(bounds.getSize(new THREE.Vector3()).y * 0.5, 0.5);
        }

        frameObject(cameraRef.current, controlsRef.current, root);

        let meshes = 0;
        let triangles = 0;
        const materials = new Set<string>();

        root.traverse((object: THREE.Object3D) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          meshes += 1;
          if (mesh.geometry.index) {
            triangles += mesh.geometry.index.count / 3;
          } else {
            triangles += mesh.geometry.attributes.position.count / 3;
          }
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat: THREE.Material) => materials.add(mat.uuid));
        });
        onStats({ meshes, triangles: Math.floor(triangles), materials: materials.size });

        const basicWalkClip = buildBasicWalkClip(root);
        const allClips = basicWalkClip ? [...gltf.animations, basicWalkClip] : gltf.animations;

        const clips = allClips.map((clip) => {
          const keyframes = clip.tracks.reduce((sum, track) => sum + track.times.length, 0);
          const boneTracks = clip.tracks.filter((track) => track.name.includes(".bones[")).length;
          const morphTracks = clip.tracks.filter((track) => track.name.includes("morphTargetInfluences")).length;
          const transformTracks = clip.tracks.filter(
            (track) => track.name.endsWith(".position") || track.name.endsWith(".quaternion") || track.name.endsWith(".scale")
          ).length;
          const uniqueTimes = new Set<number>();
          clip.tracks.forEach((track) => {
            for (const t of track.times) {
              uniqueTimes.add(t);
            }
          });
          const estimatedFps = clip.duration > 0 ? uniqueTimes.size / clip.duration : 0;
          const channelKinds = Array.from(
            new Set(
              clip.tracks.map((track) => {
                if (track.name.endsWith(".position")) return "position";
                if (track.name.endsWith(".quaternion")) return "quaternion";
                if (track.name.endsWith(".scale")) return "scale";
                if (track.name.includes("morphTargetInfluences")) return "morph";
                return "custom";
              })
            )
          );
          return {
            name: clip.name || `clip_${Math.random().toString(16).slice(2, 7)}`,
            durationSec: clip.duration,
            tracks: clip.tracks.length,
            keyframes,
            boneTracks,
            morphTracks,
            transformTracks,
            estimatedFps,
            channelKinds,
            hasSkeletalTracks: boneTracks > 0,
          };
        });

        const skeletonMap = new Map<string, SkeletonMeta>();
        root.traverse((object: THREE.Object3D) => {
          const skinned = object as THREE.SkinnedMesh;
          if (!skinned.isSkinnedMesh || !skinned.skeleton) return;
          const key = skinned.skeleton.uuid;
          const existing = skeletonMap.get(key);
          if (existing) {
            existing.skinnedMeshCount += 1;
            return;
          }

          const roots = skinned.skeleton.bones.filter((bone) => !bone.parent || !(bone.parent instanceof THREE.Bone));
          skeletonMap.set(key, {
            skeletonName: skinned.name || `skeleton_${skeletonMap.size + 1}`,
            boneCount: skinned.skeleton.bones.length,
            rootBoneCount: roots.length,
            skinnedMeshCount: 1,
            hasInverseBindMatrices: Boolean(skinned.skeleton.boneInverses?.length),
            sampleBones: skinned.skeleton.bones.slice(0, 8).map((bone) => bone.name || "unnamed_bone"),
          });
        });

        onAnimationData({ clips, skeletons: Array.from(skeletonMap.values()) });

        if (allClips.length > 0) {
          const mixer = new THREE.AnimationMixer(root);
          mixerRef.current = mixer;
          allClips.forEach((clip, index) => {
            const normalizedName = clip.name || `clip_${index + 1}`;
            clip.name = normalizedName;
            const action = mixer.clipAction(clip);
            action.enabled = true;
            action.clampWhenFinished = false;
            actionsRef.current.set(normalizedName, action);
            clipDurationsRef.current.set(normalizedName, clip.duration);
          });

          const first = clips[0]?.name;
          if (first) {
            const action = actionsRef.current.get(first);
            if (action) {
              action.reset();
              action.paused = !isPlayingRef.current;
              action.play();
            }
          }
        }

        previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        previewUrlsRef.current = [];

        const textureSet = new Set<string>();
        const textures: Array<{ texture: THREE.Texture; name: string }> = [];
        root.traverse((object: THREE.Object3D) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((material: THREE.Material) => {
            const mat = material as THREE.MeshStandardMaterial;
            const candidates: Array<[string, THREE.Texture | null]> = [
              ["baseColor", mat.map ?? null],
              ["normal", mat.normalMap ?? null],
              ["roughness", mat.roughnessMap ?? null],
              ["metalness", mat.metalnessMap ?? null],
              ["emissive", mat.emissiveMap ?? null],
            ];
            candidates.forEach(([label, texture]) => {
              if (!texture) return;
              if (textureSet.has(texture.uuid)) return;
              textureSet.add(texture.uuid);
              textures.push({ texture, name: `${material.name || "material"}.${label}` });
            });
          });
        });

        const limited = textures.slice(0, 30);
        const extracted: Array<{ name: string; width: number; height: number; previewUrl: string }> = [];
        for (const entry of limited) {
          const preview = await createTexturePreview(entry.texture);
          if (!preview) continue;
          previewUrlsRef.current.push(preview.previewUrl);
          extracted.push({
            name: entry.name,
            width: preview.width,
            height: preview.height,
            previewUrl: preview.previewUrl,
          });
        }

        onTextures(extracted);
        onLoadState({
          isLoading: false,
          progress: 100,
          message: shouldUseBaseMannequin ? "Ready (base mannequin preview)" : "Ready",
        });
      },
      (progressEvent: ProgressEvent<EventTarget>) => {
        const progress = progressEvent.total > 0 ? Math.min(99, (progressEvent.loaded / progressEvent.total) * 100) : 0;
        onLoadState({ isLoading: true, progress, message: "Streaming mesh + textures" });
      },
      () => {
        URL.revokeObjectURL(fileUrl);
        onStats({ meshes: 0, triangles: 0, materials: 0 });
        onTextures([]);
        onAnimationData({ clips: [], skeletons: [] });
        onLoadState({ isLoading: false, progress: 0, message: "Load failed" });
      }
    );

    return () => {
      URL.revokeObjectURL(fileUrl);
    };
  }, [modelFile, onAnimationData, onLoadState, onStats, onTextures]);

  useEffect(() => {
    const actions = actionsRef.current;
    if (actions.size === 0) return;
    let selected: THREE.AnimationAction | null = null;
    actions.forEach((action, name) => {
      if (selectedAnimation && name === selectedAnimation) {
        selected = action;
        return;
      }
      action.stop();
    });

    if (!selected) {
      const first = actions.values().next().value as THREE.AnimationAction | undefined;
      if (!first) return;
      selected = first;
    }

    selected.enabled = true;
    selected.play();
    selected.paused = !isAnimationPlaying;
  }, [isAnimationPlaying, selectedAnimation]);

  useEffect(() => {
    const actions = actionsRef.current;
    if (actions.size === 0) return;
    const active = selectedAnimation && actions.has(selectedAnimation)
      ? actions.get(selectedAnimation) ?? null
      : (actions.values().next().value as THREE.AnimationAction | undefined) ?? null;
    if (!active || !mixerRef.current) return;
    const duration = clipDurationsRef.current.get(active.getClip().name) ?? active.getClip().duration;
    mixerRef.current.setTime(Math.max(0, Math.min(1, scrubNormalized)) * duration);
  }, [scrubNormalized, selectedAnimation]);

  return <div ref={mountRef} className="w-full border border-zinc-800 bg-black" />;
}
