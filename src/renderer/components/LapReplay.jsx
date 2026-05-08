import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

// Modelo GLB servido via protocolo custom (registrado no main.js)
const CAR_MODEL_URL = "lmu-asset://asset/2022_bmw_m4_gt3.glb";

/**
 * Replay 3D de uma volta (sem comparacao).
 * - Modo LIVRE (OrbitControls): usuario pode rotacionar/zoom com mouse — util pra verificar tracado
 * - Modo CHASE: camera atras do carro, rotaciona junto
 * - Timeline embaixo pra scrub, play/pause, reverso, velocidades
 */

function buildReplay(samples, sharedCenter = null) {
  if (!samples || samples.length < 10) return null;
  // 1) Filtra invalidos
  const filtered = samples.filter(
    (s) => typeof s.x === "number" && typeof s.z === "number"
  );
  if (filtered.length < 10) return null;
  // 2) DEDUPE — pula sample se x/z OU t nao mudaram desde o anterior.
  // Ambas as colisoes quebram Catmull-Rom:
  //   - x/z iguais: tracker leu mesmo estado 2x (game update <20Hz)
  //   - t iguais com x/z diferentes: anomalia de dados (rounding ou
  //     multiplos escritores) — CR divide por zero no dt.
  const dedup = [];
  for (const s of filtered) {
    const last = dedup[dedup.length - 1];
    if (
      !last ||
      ((s.x !== last.x || s.z !== last.z) && s.t !== last.t)
    ) {
      dedup.push(s);
    }
  }
  if (dedup.length < 10) return null;
  // 3) Inverte X — LMU usa eixo X oposto ao three.js
  let pts = dedup.map((s) => ({ ...s, x: -s.x }));
  // 4) Suavizacao de posicao (moving average) — remove wobble sub-metrico.
  // Visivel principalmente no fantasma, que se move na tela (ao contrario do
  // carro principal que fica centralizado).
  const SMOOTH_W = 2;
  const smoothed = pts.map((_, i) => {
    let sx = 0, sz = 0, n = 0;
    for (let j = -SMOOTH_W; j <= SMOOTH_W; j++) {
      const k = i + j;
      if (k >= 0 && k < pts.length) {
        sx += pts[k].x;
        sz += pts[k].z;
        n++;
      }
    }
    return { ...pts[i], x: sx / n, z: sz / n };
  });
  pts = smoothed;

  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  // Usa centro compartilhado se fornecido (pra alinhar volta de referencia com a atual)
  const cx = sharedCenter ? sharedCenter.cx : (minX + maxX) / 2;
  const cz = sharedCenter ? sharedCenter.cz : (minZ + maxZ) / 2;
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const mapSize = Math.max(sizeX, sizeZ);

  // Direcao via diff simples centrada
  const rawDirs = pts.map((_, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const mag = Math.hypot(dx, dz);
    return mag > 1e-6 ? { dx: dx / mag, dz: dz / mag } : null;
  });
  // Preenche nulls com vizinho
  for (let i = 0; i < rawDirs.length; i++) {
    if (!rawDirs[i]) {
      rawDirs[i] = rawDirs.find((d) => d) || { dx: 1, dz: 0 };
    }
  }

  // Suaviza vetores de direcao (media movel janela 5) e guarda cos/sin direto
  // pra poder interpolar os componentes (evita wrap-around em ±π)
  const W = 5;
  const smoothedDirs = rawDirs.map((_, i) => {
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let j = -W; j <= W; j++) {
      const k = i + j;
      if (k >= 0 && k < rawDirs.length) {
        sx += rawDirs[k].dx;
        sz += rawDirs[k].dz;
        n++;
      }
    }
    const ax = sx / n;
    const az = sz / n;
    const mag = Math.hypot(ax, az);
    return mag > 1e-6 ? { cx: ax / mag, cz: az / mag } : { cx: 1, cz: 0 };
  });

  const normalized = pts.map((p, i) => ({
    x: p.x - cx,
    z: p.z - cz,
    t: p.t,
    d: p.d,
    v: p.v,
    th: p.th ?? 0,
    br: p.br ?? 0,
    st: p.st ?? 0,
    g: p.g ?? 0,
    rpm: p.rpm ?? 0,
    yaw: Math.atan2(smoothedDirs[i].cz, smoothedDirs[i].cx),
    cxd: smoothedDirs[i].cx,
    czd: smoothedDirs[i].cz,
  }));

  const startT = normalized[0].t;
  const endT = normalized[normalized.length - 1].t;

  return {
    points: normalized,
    totalTime: endT - startT,
    startT,
    mapSize,
    center: { cx, cz },
  };
}

// Catmull-Rom uniforme (C1 — velocidade contínua nos boundaries de sample)
// Linear interp causava descontinuidade de velocidade a cada 50ms (20Hz raw),
// percebido como "stutter" apesar de RAF perfeito.
function crSpline(a, b, c, d, u, u2, u3) {
  return (
    0.5 *
    (2 * b +
      (-a + c) * u +
      (2 * a - 5 * b + 4 * c - d) * u2 +
      (-a + 3 * b - 3 * c + d) * u3)
  );
}

// Objeto reusado (cada caller passa seu proprio "out" pra zero alocacao por frame)
function sampleAt(replay, elapsed, out) {
  if (!out) out = {};
  const pts = replay.points;
  const N = pts.length;
  const t = Math.max(0, Math.min(elapsed, replay.totalTime));
  const absT = replay.startT + t;
  // Binary search: i1 tem maior t <= absT
  let lo = 0;
  let hi = N - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= absT) lo = mid;
    else hi = mid;
  }
  const i1 = lo;
  const i2 = hi;
  const i0 = Math.max(0, i1 - 1);
  const i3 = Math.min(N - 1, i2 + 1);
  const p0 = pts[i0];
  const p1 = pts[i1];
  const p2 = pts[i2];
  const p3 = pts[i3];
  const dt = p2.t - p1.t;
  const u = dt > 1e-9 ? (absT - p1.t) / dt : 0;
  const u2 = u * u;
  const u3 = u2 * u;

  out.x = crSpline(p0.x, p1.x, p2.x, p3.x, u, u2, u3);
  out.z = crSpline(p0.z, p1.z, p2.z, p3.z, u, u2, u3);
  // Interpola componentes cos/sin (evita wrap em ±π) com Catmull-Rom
  const cxd = crSpline(p0.cxd, p1.cxd, p2.cxd, p3.cxd, u, u2, u3);
  const czd = crSpline(p0.czd, p1.czd, p2.czd, p3.czd, u, u2, u3);
  out.yaw = Math.atan2(czd, cxd);
  out.v = crSpline(p0.v, p1.v, p2.v, p3.v, u, u2, u3);
  out.th = crSpline(p0.th, p1.th, p2.th, p3.th, u, u2, u3);
  out.br = crSpline(p0.br, p1.br, p2.br, p3.br, u, u2, u3);
  out.st = crSpline(p0.st, p1.st, p2.st, p3.st, u, u2, u3);
  out.d = crSpline(p0.d, p1.d, p2.d, p3.d, u, u2, u3);
  // Marcha: categorica, usa o valor do sample mais proximo (sem interp)
  out.g = u < 0.5 ? p1.g : p2.g;
  out.rpm = crSpline(p0.rpm, p1.rpm, p2.rpm, p3.rpm, u, u2, u3);
  return out;
}

// Tubo super fino — apenas pra visualizar o tracado
function TrackTube({ points, ghost = false }) {
  const geometry = useMemo(() => {
    const vs = points.map((p) => new THREE.Vector3(p.x, 0.1, p.z));
    const curve = new THREE.CatmullRomCurve3(vs, false, "centripetal", 0.5);
    const segs = Math.min(1000, points.length);
    return new THREE.TubeGeometry(curve, segs, 0.25, 6, false);
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      {ghost ? (
        <meshStandardMaterial
          color="#cfd6e4"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      ) : (
        <meshStandardMaterial
          color="#888892"
          emissive="#444448"
          emissiveIntensity={0.3}
          roughness={0.7}
        />
      )}
    </mesh>
  );
}

// Box fallback enquanto modelo GLB carrega (ou se falhar)
function CarBox({ ghost = false }) {
  return (
    <mesh position={[0, 0.4, 0]}>
      <boxGeometry args={[1.8, 0.8, 4.3]} />
      {ghost ? (
        <meshStandardMaterial
          color="#cfd6e4"
          emissive="#9fb0c8"
          emissiveIntensity={0.35}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      ) : (
        <meshStandardMaterial
          color="#ff2d2d"
          emissive="#ff2d2d"
          emissiveIntensity={0.4}
        />
      )}
    </mesh>
  );
}

// Modelo GLB clonado — materiais independentes entre main/fantasma
function CarModel({ ghost = false }) {
  const { scene } = useGLTF(CAR_MODEL_URL);
  const { clone, fitScale, offset } = useMemo(() => {
    const c = scene.clone(true);
    // Converte materiais pra Lambert (diffuse only, sem PBR) — muito mais rapido
    // que MeshStandardMaterial/Physical. Preserva cor + textura diffuse.
    const simplify = (m) => {
      const lam = new THREE.MeshLambertMaterial({
        color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
        map: m.map || null,
        transparent: m.transparent,
        opacity: m.opacity,
        side: m.side,
      });
      return lam;
    };
    c.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = Array.isArray(o.material)
          ? o.material.map(simplify)
          : simplify(o.material);
        if (ghost) {
          const applyGhost = (m) => {
            m.transparent = true;
            m.opacity = 0.45;
            m.depthWrite = false;
            if (m.color) m.color.set("#cfd6e4");
            m.map = null;
          };
          if (Array.isArray(o.material)) o.material.forEach(applyGhost);
          else applyGhost(o.material);
        }
      }
    });
    // Auto-fit: escala pra ~4.3m de comprimento e centraliza origem
    const bbox = new THREE.Box3().setFromObject(c);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const longest = Math.max(size.x, size.z);
    const TARGET = 4.3;
    const fs = longest > 0 ? TARGET / longest : 1;
    return {
      clone: c,
      fitScale: fs,
      offset: [-center.x, -bbox.min.y, -center.z],
    };
  }, [scene, ghost]);
  return (
    <group scale={fitScale}>
      <primitive object={clone} position={offset} />
    </group>
  );
}

// Carro — modelo GLB com fallback pra box enquanto carrega
const Car = memo(function Car({ carRef, ghost = false }) {
  return (
    <group ref={carRef} scale={3}>
      <Suspense fallback={<CarBox ghost={ghost} />}>
        <CarModel ghost={ghost} />
      </Suspense>
    </group>
  );
});

// Uma unica useFrame que atualiza carro(s) e (opcionalmente) camera — sem race
function Updater({
  replay,
  reference,
  getTimeRef,
  carRef,
  ghostRef,
  chaseCamera,
  chaseZoomRef,
}) {
  const { camera } = useThree();
  const initialized = useRef(false);
  // Buffers reusados — zero alocacao por frame
  const sMainRef = useRef({});
  const sGhostRef = useRef({});
  const targetPosRef = useRef(null);
  const targetLookRef = useRef(null);
  const smoothLookRef = useRef(null);
  if (!targetPosRef.current) {
    targetPosRef.current = new THREE.Vector3();
    targetLookRef.current = new THREE.Vector3();
    smoothLookRef.current = new THREE.Vector3();
  }
  useFrame(() => {
    const s = sampleAt(replay, getTimeRef.current(), sMainRef.current);
    if (carRef.current) {
      carRef.current.position.set(s.x, 0.3, s.z);
      carRef.current.rotation.y = Math.PI / 2 - s.yaw;
    }
    if (reference && ghostRef?.current) {
      const g = sampleAt(reference, getTimeRef.current(), sGhostRef.current);
      ghostRef.current.position.set(g.x, 0.3, g.z);
      ghostRef.current.rotation.y = Math.PI / 2 - g.yaw;
    }
    if (chaseCamera) {
      const fx = Math.cos(s.yaw);
      const fz = Math.sin(s.yaw);
      const zoom = chaseZoomRef?.current ?? 1;
      const behind = 28 * zoom;
      const above = 12 * zoom;
      const la = 6 * zoom;
      camera.position.set(s.x - fx * behind, above, s.z - fz * behind);
      camera.lookAt(s.x + fx * la, 2, s.z + fz * la);
      initialized.current = true;
    }
  });
  useEffect(() => {
    initialized.current = false;
  }, [chaseCamera]);
  return null;
}

function Ground({ mapSize }) {
  const s = Math.max(800, mapSize * 1.8);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
        <planeGeometry args={[s, s]} />
        <meshStandardMaterial color="#0b0b0e" roughness={1} />
      </mesh>
      <gridHelper args={[s, Math.round(s / 25), "#1f1f24", "#141418"]} />
    </>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[80, 140, 60]} intensity={1.0} />
      <hemisphereLight args={["#aaccff", "#222222", 0.3]} />
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Scene 2D (top-down, sempre com carro atual centralizado, auto-zoom)
// ──────────────────────────────────────────────────────────────
// Scene2D: traçado renderizado como SVG estatico (vetor, sem blur).
// Wrapper CSS transform faz pan/zoom — GPU composita.
// Carro fixo no centro (DOM div), fantasma posicionado por translate3d.

function Scene2D({ replay, reference, getTimeRef }) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const ghostDomRef = useRef(null);

  // Bbox em coords de mundo (pra viewBox do SVG)
  const bbox = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of replay.points) {
      const x = -p.x, y = -p.z;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (reference) {
      for (const p of reference.points) {
        const x = -p.x, y = -p.z;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const PAD = 50;
    minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }, [replay, reference]);

  // Constroi os paths SVG uma vez
  const mainPathD = useMemo(() => {
    let d = "";
    const pts = replay.points;
    for (let i = 0; i < pts.length; i++) {
      d += (i === 0 ? "M" : "L") + " " + (-pts[i].x).toFixed(2) + " " + (-pts[i].z).toFixed(2) + " ";
    }
    return d;
  }, [replay]);
  const ghostPathD = useMemo(() => {
    if (!reference) return "";
    let d = "";
    const pts = reference.points;
    for (let i = 0; i < pts.length; i++) {
      d += (i === 0 ? "M" : "L") + " " + (-pts[i].x).toFixed(2) + " " + (-pts[i].z).toFixed(2) + " ";
    }
    return d;
  }, [reference]);

  // Container size cache
  const sizeRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Animation loop — SO atualiza CSS transforms (zero canvas redraw)
  useEffect(() => {
    let raf;
    let active = true;
    const sBuf = {};
    const gBuf = {};

    const loop = () => {
      if (!active) return;
      const { w, h } = sizeRef.current;
      if (w === 0) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const s = sampleAt(replay, getTimeRef.current(), sBuf);
      const g = reference ? sampleAt(reference, getTimeRef.current(), gBuf) : null;
      const sx = -s.x, sy = -s.z;

      // Zoom auto: cabe fantasma + 30% margem, minimo 80m de largura
      const ar = w / h;
      let targetHalfW = 40;
      let targetHalfH = 40;
      if (g) {
        targetHalfW = Math.max(targetHalfW, Math.abs(sx - -g.x) * 1.3);
        targetHalfH = Math.max(targetHalfH, Math.abs(sy - -g.z) * 1.3);
      }
      if (targetHalfW / targetHalfH < ar) targetHalfW = targetHalfH * ar;
      else targetHalfH = targetHalfW / ar;
      const sc = (h / 2) / targetHalfH; // px-screen por metro

      // SVG tem CSS size = bbox.w/h (1px = 1m). Apos scale(sc), 1 unidade SVG = sc pixels.
      // Pra carro (sx,sy) ficar em (W/2, H/2):
      const tx = w / 2 - (sx - bbox.minX) * sc;
      const ty = h / 2 - (sy - bbox.minY) * sc;

      if (wrapperRef.current) {
        wrapperRef.current.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${sc.toFixed(4)})`;
      }

      // Fantasma: posicionado em coords de tela relativas ao carro centralizado
      if (g && ghostDomRef.current) {
        const gScreenX = (-g.x - sx) * sc + w / 2;
        const gScreenY = (-g.z - sy) * sc + h / 2;
        ghostDomRef.current.style.transform = `translate3d(${gScreenX.toFixed(1)}px, ${gScreenY.toFixed(1)}px, 0)`;
        ghostDomRef.current.style.display = "block";
      } else if (ghostDomRef.current) {
        ghostDomRef.current.style.display = "none";
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [replay, reference, getTimeRef, bbox]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        background: "#08080c",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Wrapper recebe transform — GPU composita, zero re-paint */}
      <div
        ref={wrapperRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        <svg
          width={bbox.w}
          height={bbox.h}
          viewBox={`${bbox.minX} ${bbox.minY} ${bbox.w} ${bbox.h}`}
          shapeRendering="geometricPrecision"
          style={{ display: "block", overflow: "visible" }}
        >
          {ghostPathD && (
            <path
              d={ghostPathD}
              stroke="#ffffff"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6 4"
              fill="none"
              opacity={0.85}
            />
          )}
          <path
            d={mainPathD}
            stroke="var(--crit)"
            strokeWidth={2.2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      {/* Fantasma — posicionado relativo ao carro central */}
      <div
        ref={ghostDomRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 18,
          height: 18,
          marginLeft: -9,
          marginTop: -9,
          borderRadius: "50%",
          background: "rgba(207, 214, 228, 0.7)",
          border: "1.5px solid #fff",
          pointerEvents: "none",
          willChange: "transform",
          display: "none",
        }}
      />
      {/* Carro principal — fixo no centro, nunca se move */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 22,
          height: 22,
          marginLeft: -11,
          marginTop: -11,
          borderRadius: "50%",
          background: "var(--crit)",
          border: "2px solid #fff",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

const Scene3D = memo(function Scene3D({
  replay,
  reference,
  getTimeRef,
  carRef,
  ghostRef,
  chaseCamera,
  chaseZoomRef,
}) {
  const maxDist = useMemo(
    () => Math.max(200, replay.mapSize * 1.2),
    [replay.mapSize]
  );
  return (
    <>
      <SceneLights />
      <Ground mapSize={replay.mapSize} />
      <TrackTube points={replay.points} />
      {reference && <TrackTube points={reference.points} ghost />}
      <Car carRef={carRef} />
      {reference && <Car carRef={ghostRef} ghost />}
      <Updater
        replay={replay}
        reference={reference}
        getTimeRef={getTimeRef}
        carRef={carRef}
        ghostRef={ghostRef}
        chaseCamera={chaseCamera}
        chaseZoomRef={chaseZoomRef}
      />
      {!chaseCamera && (
        <OrbitControls
          enableDamping={false}
          minDistance={8}
          maxDistance={maxDist}
          target={[0, 0, 0]}
        />
      )}
    </>
  );
});

function Timeline({ replay, getTimeRef, onScrub }) {
  const svgRef = useRef(null);
  const lineRef = useRef(null);
  const dotRef = useRef(null);
  const W = 1200;
  const H = 80;
  const pad = 14;

  const pathD = useMemo(() => {
    const { points, totalTime, startT } = replay;
    if (totalTime <= 0) return "";
    const maxV = Math.max(...points.map((p) => p.v), 1);
    let d = "";
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = pad + ((p.t - startT) / totalTime) * (W - 2 * pad);
      const y = H - pad - (p.v / maxV) * (H - 2 * pad);
      d += `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d;
  }, [replay]);

  const fillD = pathD
    ? `${pathD} L ${W - pad} ${H - pad} L ${pad} ${H - pad} Z`
    : "";

  // RAF loop — le timeRef e atualiza cursor via ref (zero re-render)
  useEffect(() => {
    let raf;
    let lastT = -1;
    const tick = () => {
      const t = getTimeRef.current();
      if (t !== lastT) {
        const cursorX = pad + (t / replay.totalTime) * (W - 2 * pad);
        if (lineRef.current) {
          lineRef.current.setAttribute("x1", cursorX.toFixed(2));
          lineRef.current.setAttribute("x2", cursorX.toFixed(2));
        }
        if (dotRef.current) dotRef.current.setAttribute("cx", cursorX.toFixed(2));
        lastT = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replay, getTimeRef]);

  const seekFromClientX = (clientX) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    const t = ((relX - pad) / (W - 2 * pad)) * replay.totalTime;
    onScrub(Math.max(0, Math.min(replay.totalTime, t)));
  };

  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => seekFromClientX(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{
        width: "100%",
        height: H,
        cursor: dragging ? "grabbing" : "pointer",
        display: "block",
      }}
      onMouseDown={(e) => {
        setDragging(true);
        seekFromClientX(e.clientX);
      }}
    >
      <defs>
        <linearGradient id="tlGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--speed)" stopOpacity={0.5} />
          <stop offset="100%" stopColor="var(--speed)" stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="var(--bg-2)" />
      <line
        x1={pad}
        y1={H / 2}
        x2={W - pad}
        y2={H / 2}
        stroke="var(--bd-0)"
        strokeDasharray="2 4"
      />
      {fillD && <path d={fillD} fill="url(#tlGrad)" />}
      {pathD && (
        <path d={pathD} fill="none" stroke="var(--speed)" strokeWidth={1.4} />
      )}
      <line
        ref={lineRef}
        x1={pad}
        y1={4}
        x2={pad}
        y2={H - 4}
        stroke="var(--accent)"
        strokeWidth={1.5}
      />
      <circle ref={dotRef} cx={pad} cy={4} r={4} fill="var(--accent)" />
    </svg>
  );
}

function gearLabel(g) {
  if (g == null) return "—";
  if (g === 0) return "N";
  if (g < 0) return "R";
  return String(g);
}

function Hud({ replay, getTimeRef }) {
  const velocityRef = useRef(null);
  const gearRef = useRef(null);
  const throttleFillRef = useRef(null);
  const brakeFillRef = useRef(null);
  const steerFillRef = useRef(null);
  const distanceRef = useRef(null);
  const sampleBufRef = useRef({});
  const barBg = "rgba(255,255,255,0.06)";

  useEffect(() => {
    let raf;
    let lastT = -1;
    const tick = () => {
      const t = getTimeRef.current();
      if (t !== lastT) {
        const s = sampleAt(replay, t, sampleBufRef.current);
        if (velocityRef.current)
          velocityRef.current.textContent = Math.round(s.v);
        if (gearRef.current)
          gearRef.current.textContent = gearLabel(s.g);
        if (throttleFillRef.current)
          throttleFillRef.current.style.width = `${Math.max(0, Math.min(100, s.th * 100))}%`;
        if (brakeFillRef.current)
          brakeFillRef.current.style.width = `${Math.max(0, Math.min(100, s.br * 100))}%`;
        if (steerFillRef.current) {
          const steerPct = Math.max(-1, Math.min(1, s.st));
          steerFillRef.current.style.width = `${Math.abs(steerPct) * 50}%`;
          steerFillRef.current.style.transform =
            steerPct >= 0 ? "translateX(0)" : "translateX(-100%)";
        }
        if (distanceRef.current)
          distanceRef.current.textContent = `${Math.round(s.d)}m`;
        lastT = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replay, getTimeRef]);

  const labelStyle = {
    fontSize: 9,
    letterSpacing: "0.18em",
    color: "var(--tx-3)",
    textTransform: "uppercase",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="mono" style={labelStyle}>
          Velocidade
        </span>
        <span
          className="mono"
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: "var(--speed)",
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          <span ref={velocityRef}>0</span>
          <span
            className="mono"
            style={{
              fontSize: 11,
              color: "var(--tx-3)",
              marginLeft: 6,
              letterSpacing: "0.14em",
            }}
          >
            KM/H
          </span>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="mono" style={labelStyle}>
          Marcha
        </span>
        <span
          ref={gearRef}
          className="mono"
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: "var(--gear)",
            minWidth: 24,
            textAlign: "center",
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          —
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 80 }}
        >
          <span className="mono" style={labelStyle}>
            Throttle
          </span>
          <div
            style={{
              height: 6,
              background: barBg,
              border: "1px solid var(--bd-1)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              ref={throttleFillRef}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "0%",
                background: "var(--throttle)",
              }}
            />
          </div>
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 80 }}
        >
          <span className="mono" style={labelStyle}>
            Brake
          </span>
          <div
            style={{
              height: 6,
              background: barBg,
              border: "1px solid var(--bd-1)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              ref={brakeFillRef}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "0%",
                background: "var(--brake)",
              }}
            />
          </div>
        </div>
      </div>
      <div
        style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 100 }}
      >
        <span className="mono" style={labelStyle}>
          Steering
        </span>
        <div
          style={{
            height: 6,
            background: barBg,
            border: "1px solid var(--bd-1)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            ref={steerFillRef}
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: "0%",
              transform: "translateX(0)",
              background: "var(--steer)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: -2,
              bottom: -2,
              width: 1,
              background: "var(--bd-2)",
            }}
          />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="mono" style={labelStyle}>
          Distância
        </span>
        <span
          ref={distanceRef}
          className="mono"
          style={{
            fontSize: 14,
            color: "var(--tx-1)",
            fontWeight: 500,
          }}
        >
          0m
        </span>
      </div>
    </div>
  );
}

function TimeDisplay({ replay, getTimeRef }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    let lastT = -1;
    const total = replay.totalTime.toFixed(2);
    const tick = () => {
      const t = getTimeRef.current();
      if (ref.current && t !== lastT) {
        ref.current.textContent = `${t.toFixed(2)}s / ${total}s`;
        lastT = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replay, getTimeRef]);
  return (
    <span
      ref={ref}
      className="mono text-[11px] tracking-[0.15em] text-muted tabular-nums"
    >
      0.00s / {replay.totalTime.toFixed(2)}s
    </span>
  );
}

function LapReplayBase({ telemetry, reference, mode = "3d" }) {
  const replay = useMemo(() => buildReplay(telemetry), [telemetry]);
  const referenceReplay = useMemo(
    () => (reference && replay ? buildReplay(reference, replay.center) : null),
    [reference, replay]
  );

  // Fonte unica de verdade pro tempo do replay — cada consumidor chama
  // getTimeRef.current() no seu RAF e calcula de performance.now() direto.
  // Elimina race conditions entre RAFs lendo/escrevendo timeRef compartilhado.
  const playbackRef = useRef({
    playing: false,
    startAbs: 0,
    startT: 0,
    speed: 1,
    direction: 1,
    totalTime: 0,
  });
  const getTimeRef = useRef(() => playbackRef.current.startT);
  // Compatibilidade: timeRef continua exposto, sempre retorna o tempo atual via getter.
  const timeRef = useRef(0);

  const carRef = useRef();
  const ghostRef = useRef();
  const chaseZoomRef = useRef(1);
  const canvasWrapRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [direction, setDirection] = useState(1);
  const [chaseCamera, setChaseCamera] = useState(true); // padrao: chase cam

  // (Re)constroi a funcao getTime quando playback/replay mudam
  useEffect(() => {
    const total = replay?.totalTime ?? 0;
    playbackRef.current.totalTime = total;
    getTimeRef.current = () => {
      const pb = playbackRef.current;
      if (!pb.playing) return pb.startT;
      const elapsed =
        ((performance.now() - pb.startAbs) / 1000) * pb.speed * pb.direction;
      let t = pb.startT + elapsed;
      if (pb.direction > 0 && t >= pb.totalTime) t = pb.totalTime;
      else if (pb.direction < 0 && t <= 0) t = 0;
      return t;
    };
  }, [replay]);

  // Atualiza anchor do playback quando play/pause/speed/direction mudam
  useEffect(() => {
    const pb = playbackRef.current;
    // Antes de mudar, captura o tempo "atual" pra virar o novo startT
    const now = performance.now();
    if (pb.playing) {
      const elapsed =
        ((now - pb.startAbs) / 1000) * pb.speed * pb.direction;
      pb.startT = Math.max(
        0,
        Math.min(pb.totalTime, pb.startT + elapsed)
      );
    }
    pb.startAbs = now;
    pb.playing = playing;
    pb.speed = speed;
    pb.direction = direction;
  }, [playing, speed, direction]);

  // Scroll-zoom no modo chase (só 3D)
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el || mode !== "3d" || !chaseCamera) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
      chaseZoomRef.current = Math.max(
        0.3,
        Math.min(4, chaseZoomRef.current * factor)
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [chaseCamera, mode]);

  // Reset quando troca de volta
  useEffect(() => {
    const pb = playbackRef.current;
    pb.startT = 0;
    pb.startAbs = performance.now();
    pb.playing = false;
    timeRef.current = 0;
    setPlaying(false);
    setDirection(1);
  }, [telemetry]);

  // RAF loop — apenas deteta fim/inicio. Tempo real calculado por getTimeRef.
  useEffect(() => {
    if (!playing || !replay) return;
    let raf;
    let active = true;
    const loop = () => {
      if (!active) return;
      const t = getTimeRef.current();
      timeRef.current = t;
      if (
        (direction > 0 && t >= replay.totalTime) ||
        (direction < 0 && t <= 0)
      ) {
        // Snap na ancora pra evitar overshoot
        playbackRef.current.startT =
          direction > 0 ? replay.totalTime : 0;
        playbackRef.current.startAbs = performance.now();
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [playing, speed, direction, replay]);

  // Keyboard
  useEffect(() => {
    if (!replay) return;
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === "ArrowLeft") {
        const pb = playbackRef.current;
        pb.startT = Math.max(0, getTimeRef.current() - 1);
        pb.startAbs = performance.now();
        timeRef.current = pb.startT;
      } else if (e.code === "ArrowRight") {
        const pb = playbackRef.current;
        pb.startT = Math.min(
          replay.totalTime,
          getTimeRef.current() + 1
        );
        pb.startAbs = performance.now();
        timeRef.current = pb.startT;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay]);

  if (!replay) {
    return (
      <div
        style={{
          margin: "var(--pad)",
          border: "1px solid var(--bd-0)",
          background: "var(--bg-1)",
          padding: "48px var(--pad)",
          textAlign: "center",
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            color: "var(--tx-3)",
          }}
        >
          TELEMETRIA INSUFICIENTE PARA REPLAY
        </span>
      </div>
    );
  }

  const scrub = (t) => {
    const pb = playbackRef.current;
    pb.startT = Math.max(0, Math.min(pb.totalTime, t));
    pb.startAbs = performance.now();
    timeRef.current = pb.startT;
  };

  const togglePlay = () => {
    if (!playing) {
      const t = getTimeRef.current();
      if (direction > 0 && t >= replay.totalTime - 0.001) scrub(0);
      if (direction < 0 && t <= 0.001) scrub(replay.totalTime);
    }
    setPlaying((p) => !p);
  };

  const initialCam = useMemo(
    () => ({
      fov: 55,
      near: 0.5,
      far: 5000,
      position: [
        replay.mapSize * 0.7,
        replay.mapSize * 0.8,
        replay.mapSize * 0.7,
      ],
    }),
    [replay.mapSize]
  );

  return (
    <div
      style={{
        background: "var(--bg-1)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--bd-0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          background: "var(--bg-1)",
          flexShrink: 0,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--tx-1)",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {mode === "2d"
            ? "Replay 2D · Top-Down · Auto-Zoom"
            : `Replay 3D · ${chaseCamera ? "Câmera Chase" : "Câmera Livre"}`}
        </span>
        {mode === "3d" && (
          <button
            type="button"
            className="mono"
            onClick={() => setChaseCamera((c) => !c)}
            style={{
              padding: "5px 12px",
              fontSize: 10,
              letterSpacing: "0.14em",
              background: chaseCamera ? "var(--bg-3)" : "transparent",
              color: chaseCamera ? "var(--accent)" : "var(--tx-2)",
              border: "1px solid",
              borderColor: chaseCamera ? "var(--accent)" : "var(--bd-1)",
              cursor: "pointer",
              fontWeight: chaseCamera ? 600 : 400,
              textTransform: "uppercase",
            }}
            title={
              chaseCamera
                ? "Voltar pra câmera livre (OrbitControls)"
                : "Ativar câmera que segue atrás do carro"
            }
          >
            {chaseCamera ? "◉ CHASE" : "○ CHASE"}
          </button>
        )}
      </div>

      <div
        ref={canvasWrapRef}
        style={{
          flex: 1,
          minHeight: 280,
          background: "linear-gradient(to bottom, #08080c 0%, #131319 100%)",
          position: "relative",
        }}
      >
        {mode === "2d" ? (
          <Scene2D
            replay={replay}
            reference={referenceReplay}
            getTimeRef={getTimeRef}
          />
        ) : (
          <Canvas camera={initialCam} dpr={1} frameloop="always">
            <Scene3D
              replay={replay}
              reference={referenceReplay}
              getTimeRef={getTimeRef}
              carRef={carRef}
              ghostRef={ghostRef}
              chaseCamera={chaseCamera}
              chaseZoomRef={chaseZoomRef}
            />
          </Canvas>
        )}
        {mode === "3d" && chaseCamera && (
          <div
            style={{
              position: "absolute",
              right: 16,
              bottom: "50%",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              pointerEvents: "auto",
            }}
          >
            <button
              type="button"
              className="btn"
              onClick={() => {
                chaseZoomRef.current = Math.max(
                  0.3,
                  chaseZoomRef.current / 1.2
                );
              }}
              title="Aproximar"
              style={{ padding: "4px 10px", fontSize: 14 }}
            >
              +
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                chaseZoomRef.current = Math.min(
                  4,
                  chaseZoomRef.current * 1.2
                );
              }}
              title="Afastar"
              style={{ padding: "4px 10px", fontSize: 14 }}
            >
              −
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                chaseZoomRef.current = 1;
              }}
              title="Resetar zoom"
              style={{ padding: "2px 8px", fontSize: 9 }}
            >
              1×
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--bd-0)",
          background: "var(--bg-1)",
          flexShrink: 0,
        }}
      >
        <Hud replay={replay} getTimeRef={getTimeRef} />
      </div>

      <div
        style={{
          borderTop: "1px solid var(--bd-0)",
          background: "var(--bg-2)",
          flexShrink: 0,
        }}
      >
        <Timeline replay={replay} getTimeRef={getTimeRef} onScrub={scrub} />
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--bd-0)",
          background: "var(--bg-1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className={playing ? "btn" : "btn solid"}
            onClick={togglePlay}
            style={{ padding: "7px 14px", fontSize: 11 }}
          >
            {playing ? "⏸ PAUSAR" : "▶ REPRODUZIR"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => scrub(0)}
            style={{ padding: "7px 10px" }}
            title="Voltar ao início"
          >
            ⏮
          </button>
          <button
            type="button"
            className="mono"
            onClick={() => setDirection((d) => -d)}
            style={{
              padding: "7px 12px",
              fontSize: 10,
              letterSpacing: "0.14em",
              background: direction < 0 ? "var(--bg-3)" : "transparent",
              color: direction < 0 ? "var(--accent)" : "var(--tx-1)",
              border: "1px solid",
              borderColor: direction < 0 ? "var(--accent)" : "var(--bd-1)",
              cursor: "pointer",
              textTransform: "uppercase",
              fontWeight: direction < 0 ? 600 : 400,
            }}
          >
            {direction > 0 ? "▶▶ FRENTE" : "◀◀ REVERSO"}
          </button>
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "var(--tx-3)",
              marginLeft: 8,
              textTransform: "uppercase",
            }}
          >
            Vel
          </span>
          <div
            style={{
              display: "inline-flex",
              border: "1px solid var(--bd-1)",
            }}
          >
            {[0.25, 0.5, 1, 2, 4].map((sp, i, arr) => {
              const active = speed === sp;
              return (
                <button
                  key={sp}
                  type="button"
                  className="mono"
                  onClick={() => setSpeed(sp)}
                  style={{
                    padding: "6px 10px",
                    fontSize: 10,
                    letterSpacing: "0.05em",
                    background: active ? "var(--bg-3)" : "transparent",
                    color: active ? "var(--accent)" : "var(--tx-2)",
                    border: "none",
                    borderRight:
                      i < arr.length - 1
                        ? "1px solid var(--bd-1)"
                        : "none",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {sp}×
                </button>
              );
            })}
          </div>
        </div>
        <TimeDisplay replay={replay} getTimeRef={getTimeRef} />
      </div>
    </div>
  );
}

export default memo(LapReplayBase);
