import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { motion } from "framer-motion";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const BONE = "#efede8";
const INK = "#111111";

const COUNT = 7;
const CARD_W = 0.9;
const CARD_H = 1.6;
const CARD_R = 0.085;
const FACE_INSET = 0.04;
const FACE_W = CARD_W - FACE_INSET * 2;
const FACE_H = CARD_H - FACE_INSET * 2;
const FACE_ASPECT = FACE_W / FACE_H;
const BODY_DEPTH = 0.02;
const BEVEL = 0.012;
const FACE_Z = BODY_DEPTH / 2 + BEVEL + 0.002;

const damp = THREE.MathUtils.damp;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;

// ---------------------------------------------------------------------------
// Geometry and textures (built once, shared by all cards)
// ---------------------------------------------------------------------------

function roundedRectShape(w, h, r) {
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function makeBodyGeometry() {
  const shape = roundedRectShape(CARD_W - BEVEL * 2, CARD_H - BEVEL * 2, CARD_R - BEVEL);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: BODY_DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function makeFaceGeometry() {
  const geo = new THREE.ShapeGeometry(roundedRectShape(FACE_W, FACE_H, CARD_R - FACE_INSET * 0.6), 8);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + FACE_W / 2) / FACE_W, (pos.getY(i) + FACE_H / 2) / FACE_H);
  }
  uv.needsUpdate = true;
  return geo;
}

// Numbered paper frame shown until a real thumbnail loads
function makePlaceholder(index) {
  const c = document.createElement("canvas");
  c.width = 270;
  c.height = 480;
  const g = c.getContext("2d");

  g.fillStyle = BONE;
  g.fillRect(0, 0, 270, 480);

  g.strokeStyle = "rgba(17,17,17,0.14)";
  g.lineWidth = 2;
  g.strokeRect(18, 18, 234, 444);

  g.fillStyle = "rgba(17,17,17,0.55)";
  g.font = "500 22px ui-monospace, monospace";
  g.fillText(String(index + 1).padStart(2, "0"), 34, 58);

  g.fillStyle = "rgba(17,17,17,0.18)";
  g.beginPath();
  g.moveTo(118, 214);
  g.lineTo(158, 240);
  g.lineTo(118, 266);
  g.closePath();
  g.fill();

  g.fillStyle = "rgba(17,17,17,0.4)";
  g.font = "500 14px ui-monospace, monospace";
  g.fillText("REELKEEP", 34, 440);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft contact shadow under the deck (a real cast shadow, not a glow)
function makeShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(17,17,17,0.28)");
  grad.addColorStop(0.55, "rgba(17,17,17,0.08)");
  grad.addColorStop(1, "rgba(17,17,17,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function applyCover(tex) {
  const img = tex.image;
  if (!img?.width) return;
  const imgAspect = img.width / img.height;
  if (imgAspect > FACE_ASPECT) {
    tex.repeat.set(FACE_ASPECT / imgAspect, 1);
    tex.offset.set((1 - tex.repeat.x) / 2, 0);
  } else {
    tex.repeat.set(1, imgAspect / FACE_ASPECT);
    tex.offset.set(0, (1 - tex.repeat.y) / 2);
  }
  tex.needsUpdate = true;
}

function useThumbTexture(url) {
  const [tex, setTex] = useState(null);

  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    new THREE.TextureLoader().load(
      url,
      (loaded) => {
        if (!alive) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 4;
        applyCover(loaded);
        setTex(loaded);
      },
      undefined,
      () => {} // expired or broken thumbnail: keep the placeholder
    );
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

// ---------------------------------------------------------------------------
// Scene pieces
// ---------------------------------------------------------------------------

function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envMap;
    return () => {
      scene.environment = null;
      envMap.dispose();
      room.dispose?.();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

function Card({ index, url, geos, placeholder, exitRef }) {
  const ref = useRef(null);
  const tex = useThumbTexture(url);
  const k = index - (COUNT - 1) / 2; // -3 .. 3
  const rank = Math.abs(k);

  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;

    const intro = easeOutCubic(clamp01((t - 0.15 - rank * 0.05) / 1.1));
    const spread = intro * (1 + Math.sin(t * 0.8) * 0.05);

    const x = k * 0.3 * spread;
    let y = -rank * 0.05 * spread + Math.sin(t * 1.1 + index) * 0.018 - (1 - intro) * 0.35;
    let z = -rank * 0.14;
    let rx = 0;
    const ry = k * 0.14 * spread;
    let rz = -k * 0.085 * spread;

    const exitAt = exitRef.current;
    if (exitAt !== null) {
      const p = easeInCubic(clamp01((t - exitAt - rank * 0.045) / 0.55));
      y += p * 4.2;
      z += p * 0.8;
      rx -= p * 0.7;
      rz -= k * p * 0.25;
    }

    const lambda = exitAt !== null ? 14 : 7;
    g.position.set(
      damp(g.position.x, x, lambda, delta),
      damp(g.position.y, y, lambda, delta),
      damp(g.position.z, z, lambda, delta)
    );
    g.rotation.set(
      damp(g.rotation.x, rx, lambda, delta),
      damp(g.rotation.y, ry, lambda, delta),
      damp(g.rotation.z, rz, lambda, delta)
    );
  });

  return (
    <group ref={ref}>
      <mesh geometry={geos.body}>
        <meshPhysicalMaterial
          color={BONE}
          roughness={0.38}
          metalness={0}
          clearcoat={0.8}
          clearcoatRoughness={0.25}
        />
      </mesh>
      <mesh geometry={geos.face} position={[0, 0, FACE_Z]}>
        <meshBasicMaterial map={tex || placeholder} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Scene({ thumbs, exiting, inputRef }) {
  const tilt = useRef(null);
  const shadow = useRef(null);
  const exitRef = useRef(null);
  const exitingRef = useRef(exiting);
  const viewportWidth = useThree((s) => s.viewport.width);

  const geos = useMemo(() => ({ body: makeBodyGeometry(), face: makeFaceGeometry() }), []);
  const placeholders = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => makePlaceholder(i)),
    []
  );
  const shadowTex = useMemo(makeShadowTexture, []);

  useEffect(() => {
    exitingRef.current = exiting;
  }, [exiting]);

  useEffect(
    () => () => {
      geos.body.dispose();
      geos.face.dispose();
      placeholders.forEach((p) => p.dispose());
      shadowTex.dispose();
    },
    [geos, placeholders, shadowTex]
  );

  useFrame((state, delta) => {
    if (exitingRef.current && exitRef.current === null) {
      exitRef.current = state.clock.elapsedTime;
    }

    const input = inputRef.current;
    const g = tilt.current;
    if (g) {
      g.rotation.y = damp(g.rotation.y, input.x * 0.32, 3, delta);
      g.rotation.x = damp(g.rotation.x, input.y * 0.18, 3, delta);
    }

    if (shadow.current) {
      const mat = shadow.current.material;
      const target = exitRef.current !== null ? 0 : 1;
      mat.opacity = damp(mat.opacity, target, 6, delta);
    }
  });

  // Shrink the deck on narrow screens so the fan never gets clipped
  const scale = Math.min(1, Math.max(0.62, viewportWidth / 3.3));

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[2.5, 4, 5]} intensity={1.1} />
      <StudioEnvironment />

      <group scale={scale}>
        <group ref={tilt}>
          {Array.from({ length: COUNT }, (_, i) => (
            <Card
              key={i}
              index={i}
              url={thumbs[i]}
              geos={geos}
              placeholder={placeholders[i]}
              exitRef={exitRef}
            />
          ))}
        </group>

        <mesh ref={shadow} position={[0, -1.02, -0.3]} scale={[3.2, 0.42, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={shadowTex} color={INK} transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

// ---------------------------------------------------------------------------
// Public component (lazy-loaded by HeroDeck)
// ---------------------------------------------------------------------------

export default function Deck3D({ thumbs, exiting, inputRef, active }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop={active ? "always" : "never"}
        camera={{ position: [0, 0, 4.4], fov: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <Scene thumbs={thumbs} exiting={exiting} inputRef={inputRef} />
      </Canvas>
    </motion.div>
  );
}