import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const IMAGE_URLS = Array.from({ length: 16 }, () => {
  const seed = Math.floor(Math.random() * 1_000_000);
  return `https://picsum.photos/seed/${seed}/640/640`;
});

const IMAGE_LIFETIME_MS = 1200;
const MAX_IMAGES = 140;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function FloatingImage({ item, texture }) {
  const meshRef = useRef(null);
  const materialRef = useRef(null);

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) {
      return;
    }

    const age = performance.now() - item.bornAt;
    const t = clamp(age / item.life, 0, 1);
    const intro = clamp(t / 0.28, 0, 1);
    const scaleFactor = 0.18 + 0.82 * easeOutCubic(intro);
    const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

    meshRef.current.scale.set(item.width * scaleFactor, item.height * scaleFactor, 1);
    materialRef.current.opacity = fade;
  });

  return (
    <mesh ref={meshRef} position={[item.x, item.y, 0]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        opacity={0}
        toneMapped={false}
      />
    </mesh>
  );
}

function ImageField({ onSpawnerReady }) {
  const textures = useLoader(THREE.TextureLoader, IMAGE_URLS);
  const [images, setImages] = useState([]);
  const nextId = useRef(1);
  const cleanupClock = useRef(0);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    textures.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
    });
  }, [textures]);

  const spawnAtNdc = useCallback(
    (ndcX, ndcY) => {
      if (textures.length === 0) {
        return;
      }

      scratch.set(ndcX, ndcY, 0).unproject(camera);

      const textureIndex = Math.floor(Math.random() * textures.length);
      const texture = textures[textureIndex];
      const source = texture.image;
      const aspect = source && source.width && source.height ? source.width / source.height : 1;
      const height = 1.35;

      const nextImage = {
        id: nextId.current,
        x: scratch.x,
        y: scratch.y,
        bornAt: performance.now(),
        life: IMAGE_LIFETIME_MS,
        width: height * aspect,
        height,
        textureIndex,
      };

      nextId.current += 1;

      setImages((prev) => {
        const next = [...prev, nextImage];
        if (next.length > MAX_IMAGES) {
          next.splice(0, next.length - MAX_IMAGES);
        }
        return next;
      });
    },
    [camera, scratch, textures]
  );

  useEffect(() => {
    onSpawnerReady(spawnAtNdc);
    return () => {
      onSpawnerReady(null);
    };
  }, [onSpawnerReady, spawnAtNdc]);

  useFrame(() => {
    const now = performance.now();
    if (now - cleanupClock.current < 100) {
      return;
    }

    cleanupClock.current = now;

    setImages((prev) => {
      const filtered = prev.filter((image) => now - image.bornAt < image.life);
      return filtered.length === prev.length ? prev : filtered;
    });
  });

  return (
    <>
      <color attach="background" args={['#05070d']} />
      {images.map((image) => (
        <FloatingImage key={image.id} item={image} texture={textures[image.textureIndex]} />
      ))}
    </>
  );
}

export default function App() {
  const spawnerRef = useRef(null);

  const bindSpawner = useCallback((fn) => {
    spawnerRef.current = fn;
  }, []);

  const handlePointerMove = useCallback((event) => {
    const spawn = spawnerRef.current;
    if (!spawn) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    spawn(ndcX, ndcY);
  }, []);

  return (
    <div className="app" onPointerMove={handlePointerMove}>
      <div className="title-overlay">Tommy da man bang center</div>
      <Canvas orthographic camera={{ position: [0, 0, 10], zoom: 100 }} dpr={[1, 1.75]}>
        <Suspense fallback={null}>
          <ImageField onSpawnerReady={bindSpawner} />
        </Suspense>
      </Canvas>
    </div>
  );
}
