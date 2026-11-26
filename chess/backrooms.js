(function (global) {
  'use strict';

  function base64ToArrayBuffer(base64) {
    const bin = atob(base64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // Periodic infinite 84m meadow tile
  const TILE = 84.0;
  const HALF_TILE = 42.0;
  const K = (Math.PI * 2.0) / TILE;

  function wrapCoord(v) {
    return ((((v + HALF_TILE) % TILE) + TILE) % TILE) - HALF_TILE;
  }

  function roadCenterX(z) {
    return 9.2 * Math.sin(z * K) + 2.6 * Math.sin(z * K * 2.0 + 0.55);
  }

  function rawTerrainY(x, z) {
    return (
      2.65 * Math.sin(x * K + 0.35) * Math.cos(z * K - 0.2) +
      1.65 * Math.cos(x * K * 2.0 - 0.7) * Math.sin(z * K + 0.85) +
      0.95 * Math.sin((x + z) * K * 2.0 + 1.1) +
      0.55 * Math.cos(x * K * 3.0 + 0.4) * Math.cos(z * K * 2.0 - 0.6) -
      0.45
    );
  }

  function terrainY(x, z) {
    const base = rawTerrainY(x, z);
    const dx = Math.abs(x - roadCenterX(z));
    const roadBlend = Math.max(0, 1 - Math.max(0, dx - 2.3) / 5.4);
    const smoothRoad = roadBlend * roadBlend * (3 - 2 * roadBlend);
    return base * (1 - smoothRoad * 0.72) + Math.max(-0.55, base * 0.25) * smoothRoad;
  }

  const GLSL_TERRAIN = `
    const float TILE = 84.0;
    const float K = 6.28318530718 / 84.0;
    float roadCenterX(float z) {
      return 9.2 * sin(z * K) + 2.6 * sin(z * K * 2.0 + 0.55);
    }
    float rawTerrainY(float x, float z) {
      return (
        2.65 * sin(x * K + 0.35) * cos(z * K - 0.2) +
        1.65 * cos(x * K * 2.0 - 0.7) * sin(z * K + 0.85) +
        0.95 * sin((x + z) * K * 2.0 + 1.1) +
        0.55 * cos(x * K * 3.0 + 0.4) * cos(z * K * 2.0 - 0.6) -
        0.45
      );
    }
    float terrainY(float x, float z) {
      float b = rawTerrainY(x, z);
      float dx = abs(x - roadCenterX(z));
      float rb = clamp(1.0 - max(0.0, dx - 2.3) / 5.4, 0.0, 1.0);
      float sr = rb * rb * (3.0 - 2.0 * rb);
      return b * (1.0 - sr * 0.72) + max(-0.55, b * 0.25) * sr;
    }
    vec3 terrainNormal(float x, float z) {
      float e = 0.22;
      float hL = terrainY(x - e, z);
      float hR = terrainY(x + e, z);
      float hD = terrainY(x, z - e);
      float hU = terrainY(x, z + e);
      return normalize(vec3(hL - hR, 2.0 * e, hD - hU));
    }
  `;

  function createHouseParts(palette) {
    const grp = new THREE.Group();
    const w = 6.8;
    const h = 6.4;
    const d = 8.2;
    const ridgeH = 3.1;
    const foundDepth = 5.2;

    const wallMat = new THREE.MeshLambertMaterial({ color: palette.wall });
    const sideWallMat = new THREE.MeshLambertMaterial({ color: palette.wallSide });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0xf4f3ed });
    const roofMat = new THREE.MeshLambertMaterial({ color: palette.roof });
    const glassMat = new THREE.MeshLambertMaterial({
      color: 0x0b0e14,
      emissive: 0x020306,
    });
    const doorMat = new THREE.MeshLambertMaterial({ color: palette.door || 0xebe8df });

    // Grounded foundation skirt reaching deep into hillslopes
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.16, foundDepth, d + 0.16),
      wallMat
    );
    foundation.position.y = -foundDepth * 0.5 + 0.15;
    grp.add(foundation);

    const baseTrim = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.24, 0.26, d + 0.24),
      trimMat
    );
    baseTrim.position.y = 0.13;
    grp.add(baseTrim);

    // Main two-story clapboard shell
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.y = h * 0.5;
    grp.add(body);

    // Corner trim boards
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        const corner = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, h + 0.08, 0.18),
          trimMat
        );
        corner.position.set(sx * (w * 0.5 + 0.02), h * 0.5, sz * (d * 0.5 + 0.02));
        grp.add(corner);
      }
    }

    // Gable peak extrusion
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-w * 0.5, 0);
    gableShape.lineTo(0, ridgeH);
    gableShape.lineTo(w * 0.5, 0);
    gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: d, bevelEnabled: false });
    gableGeo.translate(0, 0, -d * 0.5);
    const gableMesh = new THREE.Mesh(gableGeo, sideWallMat);
    gableMesh.position.y = h;
    grp.add(gableMesh);

    // Dual pitched roof slabs + ridge cap + trim fascia
    const slopeLen = Math.hypot(w * 0.5 + 0.55, ridgeH) + 0.2;
    const slopeAngle = Math.atan2(ridgeH, w * 0.5);
    const roofGroup = new THREE.Group();
    roofGroup.position.y = h;

    [-1, 1].forEach((side) => {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(slopeLen, 0.22, d + 0.8),
        roofMat
      );
      slab.position.set(side * (w * 0.25 + 0.14), ridgeH * 0.5 - 0.08, 0);
      slab.rotation.z = -side * slopeAngle;
      roofGroup.add(slab);

      const barge = new THREE.Mesh(
        new THREE.BoxGeometry(slopeLen, 0.24, 0.14),
        trimMat
      );
      barge.position.set(side * (w * 0.25 + 0.14), ridgeH * 0.5 - 0.13, d * 0.5 + 0.36);
      barge.rotation.z = -side * slopeAngle;
      roofGroup.add(barge);

      const bargeBack = barge.clone();
      bargeBack.position.z = -d * 0.5 - 0.36;
      roofGroup.add(bargeBack);
    });

    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, d + 0.84), trimMat);
    ridge.position.set(0, ridgeH + 0.04, 0);
    roofGroup.add(ridge);
    grp.add(roofGroup);

    // Muntin sash windows + crisp white frames + front door
    function addWindow(x, y, z, rotY, winW, winH) {
      const wg = new THREE.Group();
      wg.position.set(x, y, z);
      wg.rotation.y = rotY;
      wg.add(new THREE.Mesh(new THREE.BoxGeometry(winW + 0.24, winH + 0.24, 0.1), trimMat));
      const glass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.12), glassMat);
      glass.position.z = 0.01;
      wg.add(glass);
      const mullV = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH, 0.14), trimMat);
      mullV.position.z = 0.02;
      wg.add(mullV);
      [-0.22, 0.22].forEach((oy) => {
        const mullH = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.06, 0.14), trimMat);
        mullH.position.set(0, oy * winH, 0.02);
        wg.add(mullH);
      });
      const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.36, 0.11, 0.2), trimMat);
      sill.position.set(0, -winH * 0.5 - 0.08, 0.05);
      wg.add(sill);
      grp.add(wg);
    }

    // Front & back facades
    [-1, 1].forEach((fz) => {
      const rot = fz > 0 ? 0 : Math.PI;
      const zPos = fz * (d * 0.5 + 0.04);
      addWindow(-1.85, 2.05, zPos, rot, 1.05, 1.48);
      addWindow(1.85, 2.05, zPos, rot, 1.05, 1.48);
      addWindow(-1.7, 4.45, zPos, rot, 1.02, 1.38);
      addWindow(0.0, 4.45, zPos, rot, 1.02, 1.38);
      addWindow(1.7, 4.45, zPos, rot, 1.02, 1.38);
      addWindow(0.0, h + 1.45, zPos, rot, 0.85, 0.96);

      if (fz > 0) {
        const dg = new THREE.Group();
        dg.position.set(0, 1.35, zPos + 0.03);
        dg.add(new THREE.Mesh(new THREE.BoxGeometry(1.52, 2.7, 0.1), trimMat));
        const slab = new THREE.Mesh(new THREE.BoxGeometry(1.26, 2.48, 0.13), doorMat);
        slab.position.z = 0.01;
        dg.add(slab);
        grp.add(dg);
      }
    });

    // Side windows
    [-1, 1].forEach((fx) => {
      const rot = fx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      const xPos = fx * (w * 0.5 + 0.04);
      [-2.1, 0.0, 2.1].forEach((oz) => {
        addWindow(xPos, 2.15, oz, rot, 0.92, 1.38);
        addWindow(xPos, 4.45, oz, rot, 0.92, 1.32);
      });
    });

    // Optional white picket fence corners
    if (palette.fence) {
      const fenceGroup = new THREE.Group();
      for (let i = -3; i <= 3; i++) {
        if (Math.abs(i) < 1) continue;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.96, 0.06), trimMat);
        p.position.set(i * 0.92, 0.42, d * 0.5 + 1.45);
        fenceGroup.add(p);
      }
      [-1, 1].forEach((s) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.07, 0.05), trimMat);
        rail.position.set(s * 2.15, 0.68, d * 0.5 + 1.45);
        fenceGroup.add(rail);
      });
      grp.add(fenceGroup);
    }

    return grp;
  }

  function createWaterTower() {
    const grp = new THREE.Group();
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x747d82 });
    const tankMat = new THREE.MeshLambertMaterial({ color: 0x9aa4a9 });
    const coneMat = new THREE.MeshLambertMaterial({ color: 0x6f777c });

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 11.4, 6), steelMat);
      leg.position.set(Math.cos(a) * 1.45, 5.4, Math.sin(a) * 1.45);
      leg.rotation.z = -Math.cos(a) * 0.06;
      leg.rotation.x = Math.sin(a) * 0.06;
      grp.add(leg);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 3.2, 14), tankMat);
    tank.position.y = 12.1;
    grp.add(tank);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.25, 14), coneMat);
    roof.position.y = 14.3;
    grp.add(roof);
    return grp;
  }

  // Exact bone alignment helper so GLB Mixamo arms hang naturally down at her sides
  function pointBoneWorld(bone, targetChild, bindParentWorldQ, bindDirWorld, desiredDirWorld, strength) {
    if (!bone || !bone.parent || !targetChild || !bindParentWorldQ || !bindDirWorld) return;
    const invCurParent = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(invCurParent).invert();
    const delta = new THREE.Quaternion().setFromUnitVectors(bindDirWorld, desiredDirWorld.clone().normalize());
    const targetWorldQ = delta.multiply(bindParentWorldQ);
    const targetLocalQ = invCurParent.multiply(targetWorldQ);
    bone.quaternion.slerp(targetLocalQ, strength);
  }

  function create(opts) {
    const renderer = opts.renderer;
    const canvas = opts.canvas;
    const hudEl = opts.hudEl;
    const onExit = opts.onExit || (() => {});
    const getAudio = opts.getAudio || (() => null);

    let active = false;
    let pointerLocked = false;
    let lastMouseX = null;
    let lastMouseY = null;
    let brTime = 0;

    // Player state
    const pos = new THREE.Vector3(0, terrainY(0, 0) + 1.68, 0);
    let yaw = 0.06;
    let pitch = -0.02;
    let bobPhase = 0;
    let keys = Object.create(null);

    // Wrapping & progressive darkness state
    let wrapCount = 0;
    let loopDistance = 0;
    let darkness = 0;

    // 3D Wisteria Watcher state
    let watcherLoaded = false;
    let watcherVisible = true;
    let watcherDisappearCount = 0;
    let watcherRespawnTimer = 0;
    let watcherPos = new THREE.Vector3(0, 0, -28);
    let twitchTimer = 0.45;
    let twitchHold = 0;
    let twitchNeckZ = 0;
    let twitchHeadY = 0;
    let twitchHeadZ = 0;

    const brScene = new THREE.Scene();
    const dayFogColor = new THREE.Color(0xc4d2dd);
    const duskFogColor = new THREE.Color(0x3a4358);
    const nightFogColor = new THREE.Color(0x06050d);
    const liveFogColor = dayFogColor.clone();
    brScene.background = liveFogColor.clone();
    brScene.fog = new THREE.FogExp2(liveFogColor.getHex(), 0.0132);

    const brCamera = new THREE.PerspectiveCamera(
      62,
      Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight),
      0.1,
      280
    );

    const ambientLight = new THREE.AmbientLight(0xdbe6f0, 0.62);
    const hemiLight = new THREE.HemisphereLight(0xd9e8f5, 0x3b4822, 0.72);
    const sunLight = new THREE.DirectionalLight(0xfff4de, 0.92);
    sunLight.position.set(18, 28, -40);
    const flashlight = new THREE.PointLight(0xdfecff, 0, 28, 1.35);
    const watcherGlow = new THREE.PointLight(0xd8b4fe, 0, 9.5, 1.6);

    brScene.add(ambientLight, hemiLight, sunLight, flashlight, watcherGlow);

    // Level 94 Bright Clouded Daylight Sky -> Midnight Starry Sky on Looping
    const skyPlainsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDarkness: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDir = normalize(position);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform float uTime;
        uniform float uDarkness;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float fbm(vec2 p) {
          float s = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
          return s;
        }
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, -0.1, 1.0);

          vec3 dayZenith = vec3(0.45, 0.64, 0.80);
          vec3 dayHorizon = vec3(0.77, 0.83, 0.88);
          vec3 duskZenith = vec3(0.14, 0.17, 0.28);
          vec3 duskHorizon = vec3(0.28, 0.30, 0.38);
          vec3 nightZenith = vec3(0.015, 0.015, 0.042);
          vec3 nightHorizon = vec3(0.045, 0.04, 0.085);

          float d1 = clamp(uDarkness * 2.0, 0.0, 1.0);
          float d2 = clamp(uDarkness * 2.0 - 1.0, 0.0, 1.0);
          vec3 skyZenith = mix(mix(dayZenith, duskZenith, d1), nightZenith, d2);
          vec3 skyHorizon = mix(mix(dayHorizon, duskHorizon, d1), nightHorizon, d2);
          vec3 sky = mix(skyHorizon, skyZenith, pow(max(0.0, h), 0.52));

          vec3 sunDir = normalize(vec3(0.24, 0.34, -0.91));
          float sunAmt = max(0.0, dot(dir, sunDir));
          float sunScale = mix(1.0, 0.08, smoothstep(0.15, 0.85, uDarkness));
          sky += vec3(0.95, 0.93, 0.88) * pow(sunAmt, 14.0) * 0.28 * sunScale;
          sky += vec3(1.0, 0.98, 0.92) * smoothstep(0.996, 0.9995, sunAmt) * 0.72 * sunScale;

          if (h > 0.015) {
            vec2 uv = dir.xz / (h + 0.16) * 1.42 + vec2(uTime * 0.008, uTime * 0.003);
            float c = fbm(uv);
            float cMask = smoothstep(0.42, 0.78, c) * smoothstep(0.015, 0.14, h);
            vec3 cloudCol = mix(vec3(0.95, 0.96, 0.97), vec3(0.84, 0.87, 0.91), c);
            cloudCol = mix(cloudCol, vec3(0.10, 0.10, 0.16), smoothstep(0.15, 0.92, uDarkness));
            sky = mix(sky, cloudCol, cMask * mix(0.88, 0.38, uDarkness));
          }
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skySphere = new THREE.Mesh(new THREE.SphereGeometry(230, 32, 20), skyPlainsMat);
    brScene.add(skySphere);

    // Clean random hemisphere starfield (replaces projected grid stars)
    const STAR_COUNT = 1400;
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starSizes = new Float32Array(STAR_COUNT);
    const starPhases = new Float32Array(STAR_COUNT);
    const starTints = new Float32Array(STAR_COUNT * 3);
    const starRadius = 205.0;
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = Math.random();
      const theta = Math.random() * Math.PI * 2;
      const sinPhi = 0.04 + Math.pow(u, 0.82) * 0.96;
      const cosPhi = Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi));
      starPositions[i * 3] = Math.cos(theta) * cosPhi * starRadius;
      starPositions[i * 3 + 1] = sinPhi * starRadius;
      starPositions[i * 3 + 2] = Math.sin(theta) * cosPhi * starRadius;
      starSizes[i] = 1.6 + Math.pow(Math.random(), 2.2) * 2.4;
      starPhases[i] = Math.random() * Math.PI * 2;
      const tintPick = Math.random();
      if (tintPick < 0.25) {
        starTints[i * 3] = 0.78; starTints[i * 3 + 1] = 0.86; starTints[i * 3 + 2] = 1.0;
      } else if (tintPick < 0.45) {
        starTints[i * 3] = 0.90; starTints[i * 3 + 1] = 0.82; starTints[i * 3 + 2] = 1.0;
      } else if (tintPick < 0.6) {
        starTints[i * 3] = 1.0; starTints[i * 3 + 1] = 0.93; starTints[i * 3 + 2] = 0.82;
      } else {
        starTints[i * 3] = 0.96; starTints[i * 3 + 1] = 0.97; starTints[i * 3 + 2] = 1.0;
      }
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));
    starGeo.setAttribute('aTint', new THREE.BufferAttribute(starTints, 3));
    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute vec3 aTint;
        varying float vPhase;
        varying vec3 vTint;
        void main() {
          vPhase = aPhase;
          vTint = aTint;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uAlpha;
        varying float vPhase;
        varying vec3 vTint;
        void main() {
          if (uAlpha <= 0.005) discard;
          float d = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.5, 0.08, d);
          if (core <= 0.01) discard;
          float twinkle = 0.65 + 0.35 * sin(uTime * 1.9 + vPhase);
          gl_FragColor = vec4(vTint, core * twinkle * uAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    starPoints.frustumCulled = false;
    brScene.add(starPoints);

    // Infinite wrapping rolling meadow terrain (centered on camera)
    const groundGeo = new THREE.PlaneGeometry(168, 168, 128, 128);
    groundGeo.rotateX(-Math.PI * 0.5);
    const groundMat = new THREE.ShaderMaterial({
      uniforms: {
        uCenterX: { value: 0 },
        uCenterZ: { value: 0 },
        uDarkness: { value: 0 },
        uFogColor: { value: liveFogColor.clone() },
        uFogDensity: { value: 0.0132 },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: `
        uniform float uCenterX;
        uniform float uCenterZ;
        varying vec3 vWorld;
        varying vec3 vNorm;
        ${GLSL_TERRAIN}
        void main() {
          float wx = position.x + uCenterX;
          float wz = position.z + uCenterZ;
          float wy = terrainY(wx, wz);
          vWorld = vec3(wx, wy, wz);
          vNorm = terrainNormal(wx, wz);
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        varying vec3 vNorm;
        uniform float uDarkness;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uCameraPos;
        ${GLSL_TERRAIN}
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
            mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        void main() {
          float n1 = vnoise(vWorld.xz * 0.28);
          float n2 = vnoise(vWorld.xz * 2.1);
          vec3 soilMoss = mix(vec3(0.11, 0.145, 0.055), vec3(0.24, 0.30, 0.09), n1 * 0.72 + n2 * 0.28);
          float dxRoad = abs(vWorld.x - roadCenterX(vWorld.z));
          float asphaltMask = 1.0 - smoothstep(1.9, 2.35, dxRoad);
          float shoulderMask = (1.0 - smoothstep(2.2, 3.0, dxRoad)) * (1.0 - asphaltMask);

          vec3 roadCol = mix(vec3(0.14, 0.14, 0.15), vec3(0.22, 0.21, 0.20), n2);
          float centerLine = (1.0 - smoothstep(0.04, 0.09, dxRoad)) * step(0.45, fract(vWorld.z * 0.18));
          roadCol = mix(roadCol, vec3(0.76, 0.74, 0.65), centerLine * 0.52);

          vec3 col = mix(soilMoss, vec3(0.28, 0.26, 0.18), shoulderMask * 0.72);
          col = mix(col, roadCol, asphaltMask);

          vec3 sunDir = normalize(vec3(0.24, 0.68, -0.69));
          float diff = max(0.22, dot(normalize(vNorm), sunDir));
          float dayLight = mix(1.0, 0.16, uDarkness);
          float camDist = length(vWorld - uCameraPos);
          float torch = uDarkness * exp(-camDist * 0.09) * 0.58;
          col *= (0.44 + 0.64 * diff) * (dayLight + torch);

          float dist = length(vWorld - uCameraPos);
          float fogFactor = 1.0 - exp(-(uFogDensity * dist) * (uFogDensity * dist));
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.frustumCulled = false;
    brScene.add(groundMesh);

    // 52,000 Lush Thicker Tall Curved Shader Grass Blades (36m x 36m toroidal carpet)
    const GRASS_COUNT = 52000;
    const GRASS_SPAN = 36.0;
    const SEGS = 3; // 6 triangles per blade for smooth graceful arch
    const bladeVerts = [];
    const bladeNorms = [];
    const bladeYs = [];
    for (let s = 0; s < SEGS; s++) {
      const y0 = s / SEGS;
      const y1 = (s + 1) / SEGS;
      const w0 = 0.5 * Math.pow(Math.max(0.02, 1.0 - y0), 0.65);
      const w1 = s === SEGS - 1 ? 0.0 : 0.5 * Math.pow(Math.max(0.02, 1.0 - y1), 0.65);
      bladeVerts.push(
        -w0, y0, 0,  w0, y0, 0,  w1, y1, 0,
        -w0, y0, 0,  w1, y1, 0, -w1, y1, 0
      );
      for (let v = 0; v < 6; v++) {
        bladeNorms.push(0, 0.25, 0.96);
        bladeYs.push(v === 2 || v === 4 || v === 5 ? y1 : y0);
      }
    }
    const baseBlade = new THREE.BufferGeometry();
    baseBlade.setAttribute('position', new THREE.Float32BufferAttribute(bladeVerts, 3));
    baseBlade.setAttribute('normal', new THREE.Float32BufferAttribute(bladeNorms, 3));
    baseBlade.setAttribute('aBladeY', new THREE.Float32BufferAttribute(bladeYs, 1));

    const instGrassGeo = new THREE.InstancedBufferGeometry();
    instGrassGeo.index = baseBlade.index;
    instGrassGeo.attributes.position = baseBlade.attributes.position;
    instGrassGeo.attributes.normal = baseBlade.attributes.normal;
    instGrassGeo.attributes.aBladeY = baseBlade.attributes.aBladeY;

    const offsets = new Float32Array(GRASS_COUNT * 3);
    const meta = new Float32Array(GRASS_COUNT * 4);
    for (let i = 0; i < GRASS_COUNT; i++) {
      offsets[i * 3] = (Math.random() - 0.5) * GRASS_SPAN;
      offsets[i * 3 + 1] = 0;
      offsets[i * 3 + 2] = (Math.random() - 0.5) * GRASS_SPAN;
      // [yaw, tall height 0.95m-1.55m, lean curve 0.25-0.65, tone hue]
      meta[i * 4] = Math.random() * Math.PI * 2;
      meta[i * 4 + 1] = 0.95 + Math.pow(Math.random(), 1.25) * 0.6;
      meta[i * 4 + 2] = 0.24 + Math.random() * 0.42;
      meta[i * 4 + 3] = Math.random();
    }
    instGrassGeo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    instGrassGeo.setAttribute('aBladeMeta', new THREE.InstancedBufferAttribute(meta, 4));
    instGrassGeo.instanceCount = GRASS_COUNT;

    const grassMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenterX: { value: 0 },
        uCenterZ: { value: 0 },
        uDarkness: { value: 0 },
        uFogColor: { value: liveFogColor.clone() },
        uFogDensity: { value: 0.0132 },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: `
        attribute vec3 aOffset;
        attribute vec4 aBladeMeta;
        attribute float aBladeY;
        uniform float uTime;
        uniform float uCenterX;
        uniform float uCenterZ;
        uniform vec3 uCameraPos;
        varying float vH;
        varying float vTone;
        varying vec3 vWorldPos;
        varying float vRoadMask;
        ${GLSL_TERRAIN}
        void main() {
          float span = 36.0;
          float wx = mod(aOffset.x - uCenterX + span * 0.5, span) - span * 0.5 + uCenterX;
          float wz = mod(aOffset.z - uCenterZ + span * 0.5, span) - span * 0.5 + uCenterZ;
          float dxRoad = abs(wx - roadCenterX(wz));
          vRoadMask = smoothstep(2.05, 3.05, dxRoad);

          float wy = terrainY(wx, wz);
          float yaw = aBladeMeta.x;
          float bh = aBladeMeta.y * (0.25 + 0.75 * vRoadMask);
          float lean = aBladeMeta.z;
          float bw = 0.044 + 0.028 * aBladeMeta.w;

          // Multi-frequency wild gust wave
          float gust = sin(uTime * 1.45 + wx * 0.34 + wz * 0.24) * 0.55
                     + sin(uTime * 2.85 + wx * 0.78 - wz * 0.41) * 0.25
                     + 0.20;
          float flex = aBladeY * aBladeY;

          // Slender blade local space + graceful parabolic arch
          vec3 lp = vec3(position.x * bw, aBladeY * bh, position.z);
          float s = sin(yaw); float c = cos(yaw);
          vec3 wp = vec3(
            lp.x * c - lp.z * s,
            lp.y,
            lp.x * s + lp.z * c
          );
          wp.x += (sin(yaw) * lean * 0.42 + gust * 0.26) * flex;
          wp.z += (cos(yaw) * lean * 0.42 + gust * 0.19) * flex;
          wp.y -= flex * (0.14 * lean + abs(gust) * 0.06);

          // Part tall blades cleanly away from the player
          vec2 fromPlayer = vec2(wx, wz) - uCameraPos.xz;
          float pDist = length(fromPlayer) + 0.001;
          if (pDist < 1.35) {
            float push = (1.35 - pDist) / 1.35;
            vec2 pushDir = fromPlayer / pDist;
            wp.xz += pushDir * push * aBladeY * 0.65;
            wp.y -= push * aBladeY * 0.22;
          }

          vec3 worldPos = vec3(wx + wp.x, wy + wp.y - 0.04, wz + wp.z);
          vH = aBladeY;
          vTone = aBladeMeta.w;
          vWorldPos = worldPos;
          gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: `
        varying float vH;
        varying float vTone;
        varying vec3 vWorldPos;
        varying float vRoadMask;
        uniform float uDarkness;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uCameraPos;
        void main() {
          if (vRoadMask < 0.06) discard;
          // Deep olive root -> warm meadow green -> golden dry straw tips
          vec3 rootCol = mix(vec3(0.065, 0.09, 0.025), vec3(0.09, 0.125, 0.035), vTone);
          vec3 midCol = mix(vec3(0.22, 0.30, 0.075), vec3(0.30, 0.38, 0.10), vTone);
          vec3 tipCol = mix(vec3(0.44, 0.48, 0.16), vec3(0.56, 0.52, 0.22), vTone);
          vec3 col = vH < 0.55
            ? mix(rootCol, midCol, vH / 0.55)
            : mix(midCol, tipCol, (vH - 0.55) / 0.45);

          // Root contact AO + subsurface sunlit scatter
          float ao = mix(0.28, 1.06, smoothstep(0.0, 0.85, vH));
          vec3 viewDir = normalize(uCameraPos - vWorldPos);
          vec3 sunDir = normalize(vec3(0.24, 0.34, -0.91));
          float backlit = pow(max(0.0, dot(-viewDir, sunDir)), 3.0) * vH * 0.38 * (1.0 - uDarkness);

          float dayScale = mix(1.0, 0.16, uDarkness);
          float camDist = length(vWorldPos - uCameraPos);
          float torch = uDarkness * exp(-camDist * 0.105) * 0.62;
          col = (col * ao + vec3(0.45, 0.50, 0.18) * backlit) * (dayScale + torch);

          float fogFactor = 1.0 - exp(-(uFogDensity * camDist) * (uFogDensity * camDist));
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
    const grassMesh = new THREE.Mesh(instGrassGeo, grassMat);
    grassMesh.frustumCulled = false;
    brScene.add(grassMesh);

    // Non-intersecting Level 94 gable house placements on grassy hills (plus collision specs)
    const rawHouseSeeds = [
      { ox: -19, oz: -18, rot: 0.25, wall: 0xd9a734, wallSide: 0xc29229, roof: 0x3a2e28, fence: true },
      { ox: 18,  oz: -22, rot: -0.42, wall: 0xe6dec2, wallSide: 0xcfc7aa, roof: 0x4b423c, fence: false },
      { ox: -28, oz: 12,  rot: 1.15, wall: 0xcfa037, wallSide: 0xb68929, roof: 0x362d29, fence: true },
      { ox: 26,  oz: 16,  rot: -1.45, wall: 0xdfd8bf, wallSide: 0xc7bf9e, roof: 0x45413e, fence: false },
      { ox: -12, oz: 32,  rot: 0.78, wall: 0xdab048, wallSide: 0xc39a38, roof: 0x38322f, fence: false },
      { ox: 34,  oz: -6,  rot: 2.35, wall: 0xd39d34, wallSide: 0xbc8828, roof: 0x3b302a, fence: true },
      { ox: -36, oz: -34, rot: -0.88, wall: 0xe2dac0, wallSide: 0xc8bf9e, roof: 0x4b4744, fence: false },
      { ox: 14,  oz: 38,  rot: 2.85, wall: 0xcfa43b, wallSide: 0xb78c2d, roof: 0x342f2c, fence: true },
      { ox: -34, oz: 34,  rot: -2.1, wall: 0xe5ddc5, wallSide: 0xcac1a4, roof: 0x484441, fence: false },
      { ox: 36,  oz: 34,  rot: 0.52, wall: 0xdca737, wallSide: 0xc3912b, roof: 0x372f2b, fence: false },
      { ox: -14, oz: -40, rot: -1.7, wall: 0xd4a438, wallSide: 0xbc8f2c, roof: 0x3a322d, fence: true },
      { ox: 35,  oz: -35, rot: 1.9, wall: 0xe4dcc2, wallSide: 0xc7be9f, roof: 0x46413e, fence: false },
    ];

    function wrappedDist(ax, az, bx, bz) {
      let dx = wrapCoord(ax - bx);
      let dz = wrapCoord(az - bz);
      return Math.hypot(dx, dz);
    }

    function findNearbyHillCrest(startX, startZ, existing, minSep) {
      let bx = wrapCoord(startX);
      let bz = wrapCoord(startZ);
      let bestY = -1e9;
      for (let r = 0; r <= 12; r += 2) {
        const stepA = r === 0 ? Math.PI * 2 : Math.PI * 0.25;
        for (let a = 0; a < Math.PI * 2; a += stepA) {
          const tx = wrapCoord(startX + Math.cos(a) * r);
          const tz = wrapCoord(startZ + Math.sin(a) * r);
          if (Math.abs(tx - roadCenterX(tz)) < 7.5) continue;
          if (existing && existing.some((p) => wrappedDist(tx, tz, p.ox, p.oz) < minSep)) continue;
          const ty = terrainY(tx, tz);
          if (ty > bestY) {
            bestY = ty;
            bx = tx;
            bz = tz;
          }
        }
      }
      return { x: bx, z: bz, y: terrainY(bx, bz) };
    }

    const HOUSE_HW = 3.4 + 0.65;
    const HOUSE_HD = 4.1 + 0.65;
    const HOUSE_RADIUS = Math.hypot(HOUSE_HW, HOUSE_HD);
    const housePlacements = [];
    for (const seed of rawHouseSeeds) {
      const hill = findNearbyHillCrest(seed.ox, seed.oz, housePlacements, 16.0);
      const mesh = createHouseParts(seed);
      mesh.position.set(hill.x, hill.y + 0.08, hill.z);
      mesh.rotation.y = seed.rot;
      brScene.add(mesh);
      housePlacements.push({
        mesh,
        ox: hill.x,
        oz: hill.z,
        baseRot: seed.rot,
        cosR: Math.cos(-seed.rot),
        sinR: Math.sin(-seed.rot),
        cosInv: Math.cos(seed.rot),
        sinInv: Math.sin(seed.rot),
      });
    }

    const TOWER_RADIUS = 2.2;
    const waterTowerPos = findNearbyHillCrest(-25, -24, housePlacements, 13.0);
    const waterTower = createWaterTower();
    waterTower.position.set(waterTowerPos.x, waterTowerPos.y - 0.1, waterTowerPos.z);
    brScene.add(waterTower);

    // Resolve OBB collisions against wrapped houses + radial collision against wrapped water tower
    function resolveWorldCollisions(wx, wz) {
      let rx = wx;
      let rz = wz;
      for (let i = 0; i < housePlacements.length; i++) {
        const hp = housePlacements[i];
        const hx = Math.round((rx - hp.ox) / TILE) * TILE + hp.ox;
        const hz = Math.round((rz - hp.oz) / TILE) * TILE + hp.oz;
        const dx = rx - hx;
        const dz = rz - hz;
        if (Math.abs(dx) > HOUSE_RADIUS || Math.abs(dz) > HOUSE_RADIUS) continue;

        const lx = dx * hp.cosR - dz * hp.sinR;
        const lz = dx * hp.sinR + dz * hp.cosR;
        const penX = HOUSE_HW - Math.abs(lx);
        const penZ = HOUSE_HD - Math.abs(lz);
        if (penX > 0 && penZ > 0) {
          let nxLocal = lx;
          let nzLocal = lz;
          if (penX < penZ) {
            nxLocal = lx >= 0 ? HOUSE_HW : -HOUSE_HW;
          } else {
            nzLocal = lz >= 0 ? HOUSE_HD : -HOUSE_HD;
          }
          rx = hx + (nxLocal * hp.cosInv - nzLocal * hp.sinInv);
          rz = hz + (nxLocal * hp.sinInv + nzLocal * hp.cosInv);
        }
      }

      // Water tower leg cylinder
      const tx = Math.round((rx - waterTowerPos.x) / TILE) * TILE + waterTowerPos.x;
      const tz = Math.round((rz - waterTowerPos.z) / TILE) * TILE + waterTowerPos.z;
      const tdx = rx - tx;
      const tdz = rz - tz;
      const td = Math.hypot(tdx, tdz);
      if (td > 0.0001 && td < TOWER_RADIUS) {
        rx = tx + (tdx / td) * TOWER_RADIUS;
        rz = tz + (tdz / td) * TOWER_RADIUS;
      }
      return { x: rx, z: rz };
    }

    function isInsideAnyHouse(wx, wz) {
      for (let i = 0; i < housePlacements.length; i++) {
        const hp = housePlacements[i];
        const hx = Math.round((wx - hp.ox) / TILE) * TILE + hp.ox;
        const hz = Math.round((wz - hp.oz) / TILE) * TILE + hp.oz;
        const dx = wx - hx;
        const dz = wz - hz;
        const lx = dx * hp.cosR - dz * hp.sinR;
        const lz = dx * hp.sinR + dz * hp.cosR;
        if (Math.abs(lx) < HOUSE_HW - 0.15 && Math.abs(lz) < HOUSE_HD - 0.15) {
          return true;
        }
      }
      return false;
    }

    function getNearestHouseWorld(wx, wz) {
      let best = null;
      let bestDist = Infinity;
      for (let i = 0; i < housePlacements.length; i++) {
        const hp = housePlacements[i];
        const hx = Math.round((wx - hp.ox) / TILE) * TILE + hp.ox;
        const hz = Math.round((wz - hp.oz) / TILE) * TILE + hp.oz;
        const d = Math.hypot(hx - wx, hz - wz);
        if (d < bestDist) {
          bestDist = d;
          best = { x: hx, z: hz, rot: hp.baseRot, dist: d };
        }
      }
      return best;
    }

    // 3D Rigged Wisteria Watcher (replaces black cat sprite)
    const watcherGroup = new THREE.Group();
    watcherGroup.visible = false;
    brScene.add(watcherGroup);

    const wBones = {};
    const bindQ = {};
    const bindDir = {};
    let watcherArmReady = false;

    function setupWatcherModel(gltf) {
      const holder = new THREE.Group();
      const raw = gltf.scene;
      raw.updateMatrixWorld(true);

      const boneMap = {};
      raw.traverse((o) => {
        if (o.isBone) boneMap[o.name] = o;
        if (o.isMesh) {
          o.frustumCulled = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const next = mats.map((m) => {
            const std = new THREE.MeshStandardMaterial({
              map: m.map || null,
              color: m.map ? new THREE.Color(0xffffff) : m.color ? m.color.clone() : new THREE.Color(0xd8b4fe),
              emissive: m.map ? new THREE.Color(0x2d1845) : new THREE.Color(0x1f1035),
              emissiveMap: m.map || null,
              emissiveIntensity: 0.14,
              roughness: 0.72,
              metalness: 0.0,
              skinning: !!o.isSkinnedMesh,
              transparent: !!m.transparent,
              alphaTest: m.alphaTest || 0,
            });
            if (std.map) {
              std.map.encoding = THREE.sRGBEncoding;
              std.map.needsUpdate = true;
            }
            return std;
          });
          o.material = Array.isArray(o.material) ? next : next[0];
        }
      });

      const pick = (...names) => {
        for (const n of names) {
          if (boneMap[n]) return boneMap[n];
          const f = Object.keys(boneMap).find((k) => k.toLowerCase().includes(n.toLowerCase()));
          if (f) return boneMap[f];
        }
        return null;
      };

      wBones.hips = pick('mixamorigHips', 'hips');
      wBones.spine = pick('mixamorigSpine', 'spine');
      wBones.neck = pick('mixamorigNeck', 'neck');
      wBones.head = pick('mixamorigHead', 'head');
      wBones.lArm = pick('mixamorigLeftArm', 'leftarm');
      wBones.lFore = pick('mixamorigLeftForeArm', 'leftforearm');
      wBones.lHand = pick('mixamorigLeftHand', 'lefthand');
      wBones.rArm = pick('mixamorigRightArm', 'rightarm');
      wBones.rFore = pick('mixamorigRightForeArm', 'rightforearm');
      wBones.rHand = pick('mixamorigRightHand', 'righthand');

      // Scale & plant boots onto y = 0
      const box = new THREE.Box3();
      const pt = new THREE.Vector3();
      Object.keys(boneMap).forEach((k) => {
        boneMap[k].getWorldPosition(pt);
        box.expandByPoint(pt);
      });
      const rawHeight = Math.max(0.001, (box.max.y - box.min.y) * 1.42);
      const scale = 1.98 / rawHeight;
      raw.scale.setScalar(scale);
      raw.position.set(0, -box.min.y * scale + 0.06, 0);
      holder.add(raw);
      holder.updateMatrixWorld(true);

      // Save canonical world quaternions & bone vectors for clean arms-down standing pose
      const recordChain = (key, parentBone, childBone) => {
        if (!parentBone || !childBone) return;
        const pwq = new THREE.Quaternion();
        parentBone.getWorldQuaternion(pwq);
        bindQ[key] = pwq;
        const pPos = new THREE.Vector3();
        const cPos = new THREE.Vector3();
        parentBone.getWorldPosition(pPos);
        childBone.getWorldPosition(cPos);
        const dir = cPos.sub(pPos);
        if (dir.lengthSq() > 1e-6) {
          bindDir[key] = dir.normalize();
        }
      };
      recordChain('lArm', wBones.lArm, wBones.lFore);
      recordChain('lFore', wBones.lFore, wBones.lHand);
      recordChain('rArm', wBones.rArm, wBones.rFore);
      recordChain('rFore', wBones.rFore, wBones.rHand);
      if (wBones.neck) bindQ.neckLocal = wBones.neck.quaternion.clone();
      if (wBones.head) bindQ.headLocal = wBones.head.quaternion.clone();

      // Relax arms straight down beside her skirt/legs
      if (bindDir.lArm && bindDir.rArm) {
        watcherArmReady = true;
        holder.updateMatrixWorld(true);
        pointBoneWorld(wBones.lArm, wBones.lFore, bindQ.lArm, bindDir.lArm, new THREE.Vector3(0.14, -1.0, 0.08), 1.0);
        holder.updateMatrixWorld(true);
        pointBoneWorld(wBones.lFore, wBones.lHand, bindQ.lFore, bindDir.lFore, new THREE.Vector3(0.08, -1.0, 0.14), 1.0);
        holder.updateMatrixWorld(true);
        pointBoneWorld(wBones.rArm, wBones.rFore, bindQ.rArm, bindDir.rArm, new THREE.Vector3(-0.14, -1.0, 0.08), 1.0);
        holder.updateMatrixWorld(true);
        pointBoneWorld(wBones.rFore, wBones.rHand, bindQ.rFore, bindDir.rFore, new THREE.Vector3(-0.08, -1.0, 0.14), 1.0);
        holder.updateMatrixWorld(true);
      }

      watcherGroup.add(holder);
      watcherLoaded = true;
      watcherGroup.visible = watcherVisible && active;
    }

    // Load Wisteria GLB cleanly once at startup
    if (typeof THREE.GLTFLoader === 'function') {
      const loader = new THREE.GLTFLoader();
      const loadGlbFallback = () => {
        try {
          loader.load('../game/rigged-modelkurizu.glb', setupWatcherModel, undefined, () => {});
        } catch {}
      };
      if (global.PLAYER_MODEL_BASE64) {
        try {
          const ab = base64ToArrayBuffer(global.PLAYER_MODEL_BASE64);
          loader.parse(ab, '', setupWatcherModel, loadGlbFallback);
        } catch {
          loadGlbFallback();
        }
      } else {
        loadGlbFallback();
      }
    }

    function placeWatcherOnHill(wx, wz, minDist, maxDist) {
      let bestX = wx - Math.sin(yaw) * 28;
      let bestZ = wz - Math.cos(yaw) * 28;
      let bestScore = -1e9;
      for (let i = 0; i < 16; i++) {
        const ang = yaw + (i === 0 ? 0 : (Math.random() - 0.5) * 2.1);
        const dist = minDist + Math.random() * (maxDist - minDist);
        const tx = wx - Math.sin(ang) * dist;
        const tz = wz - Math.cos(ang) * dist;
        if (isInsideAnyHouse(tx, tz)) continue;
        const ty = terrainY(tx, tz);
        const score = ty - Math.abs(ang - yaw) * 0.6;
        if (score > bestScore) {
          bestScore = score;
          bestX = tx;
          bestZ = tz;
        }
      }
      watcherPos.set(bestX, terrainY(bestX, bestZ), bestZ);
      watcherGroup.position.copy(watcherPos);
    }

    // Subdued wind ambience + horror static vanish SFX
    let windNodes = null;
    function startAmbience() {
      const ctx = getAudio();
      if (!ctx || windNodes) return;
      try {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const len = Math.floor(ctx.sampleRate * 2);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          last = (last + 0.03 * (Math.random() * 2 - 1)) / 1.03;
          ch[i] = last * 2.5;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 390;

        const gain = ctx.createGain();
        gain.gain.value = 0.001;
        gain.gain.exponentialRampToValueAtTime(0.085, ctx.currentTime + 1.1);

        src.connect(lp);
        lp.connect(gain);
        gain.connect(ctx.destination);
        src.start();
        windNodes = { src, gain };
      } catch {}
    }

    function stopAmbience() {
      if (!windNodes) return;
      const ctx = getAudio();
      try {
        if (ctx) {
          windNodes.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
          setTimeout(() => {
            try { windNodes && windNodes.src.stop(); } catch {}
            windNodes = null;
          }, 260);
        } else {
          windNodes.src.stop();
          windNodes = null;
        }
      } catch {
        windNodes = null;
      }
    }

    function playStaticVanishSfx() {
      const ctx = getAudio();
      if (!ctx) return;
      try {
        const len = Math.floor(ctx.sampleRate * 0.24);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1100;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.09, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        src.connect(bp);
        bp.connect(g);
        g.connect(ctx.destination);
        src.start();
      } catch {}
    }

    function wrapWorldEntities() {
      for (let i = 0; i < housePlacements.length; i++) {
        const hp = housePlacements[i];
        hp.mesh.position.x = Math.round((pos.x - hp.ox) / TILE) * TILE + hp.ox;
        hp.mesh.position.z = Math.round((pos.z - hp.oz) / TILE) * TILE + hp.oz;
      }
      waterTower.position.x = Math.round((pos.x - waterTowerPos.x) / TILE) * TILE + waterTowerPos.x;
      waterTower.position.z = Math.round((pos.z - waterTowerPos.z) / TILE) * TILE + waterTowerPos.z;
    }

    function syncAtmosphereLighting() {
      const d1 = Math.min(1, darkness * 2.0);
      const d2 = Math.max(0, darkness * 2.0 - 1.0);
      liveFogColor.copy(dayFogColor).lerp(duskFogColor, d1).lerp(nightFogColor, d2);
      const fogDens = 0.0132 + darkness * 0.0118;

      brScene.background.copy(liveFogColor);
      brScene.fog.color.copy(liveFogColor);
      brScene.fog.density = fogDens;

      ambientLight.intensity = 0.62 - darkness * 0.51;
      hemiLight.intensity = 0.72 - darkness * 0.58;
      sunLight.intensity = 0.92 - darkness * 0.80;
      flashlight.intensity = darkness * 1.45;
      flashlight.position.set(pos.x, pos.y + 0.2, pos.z);

      skyPlainsMat.uniforms.uDarkness.value = darkness;
      starMat.uniforms.uAlpha.value = Math.max(0, Math.min(1, (darkness - 0.32) / 0.58));
      groundMat.uniforms.uDarkness.value = darkness;
      groundMat.uniforms.uFogColor.value.copy(liveFogColor);
      groundMat.uniforms.uFogDensity.value = fogDens;
      grassMat.uniforms.uDarkness.value = darkness;
      grassMat.uniforms.uFogColor.value.copy(liveFogColor);
      grassMat.uniforms.uFogDensity.value = fogDens;
    }

    function stepSimulation(dt, directStepX, directStepZ) {
      brTime += dt;
      const clampedDt = Math.min(dt, 0.06);

      // Movement (either interactive WASD or scripted test displacement)
      let stepX = 0;
      let stepZ = 0;
      let moving = false;

      if (typeof directStepX === 'number' || typeof directStepZ === 'number') {
        stepX = directStepX || 0;
        stepZ = directStepZ || 0;
        moving = Math.hypot(stepX, stepZ) > 0.001;
      } else {
        const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
        const str = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
        if (keys.KeyQ) yaw += clampedDt * 1.85;
        if (keys.KeyE) yaw -= clampedDt * 1.85;
        if (fwd !== 0 || str !== 0) {
          moving = true;
          const speed = (keys.ShiftLeft || keys.ShiftRight) ? 10.6 : 6.4;
          const len = Math.hypot(fwd, str) || 1;
          const fNorm = fwd / len;
          const sNorm = str / len;
          const fx = -Math.sin(yaw);
          const fz = -Math.cos(yaw);
          const rx = Math.cos(yaw);
          const rz = -Math.sin(yaw);
          stepX = (fx * fNorm + rx * sNorm) * speed * clampedDt;
          stepZ = (fz * fNorm + rz * sNorm) * speed * clampedDt;
        }
      }

      const prevX = pos.x;
      const prevZ = pos.z;
      const resolved = resolveWorldCollisions(pos.x + stepX, pos.z + stepZ);
      pos.x = resolved.x;
      pos.z = resolved.z;

      const movedDist = Math.hypot(pos.x - prevX, pos.z - prevZ);
      if (moving && movedDist > 0.001) {
        bobPhase += movedDist * 1.45;
      }

      // Accumulate loop distance & detect 84m tile wraps -> progressive darkness
      loopDistance += movedDist;
      const curWrap = Math.floor((Math.abs(pos.x) + Math.abs(pos.z)) / TILE);
      if (curWrap > wrapCount) wrapCount = curWrap;
      darkness = Math.min(1.0, loopDistance / 200.0 + wrapCount * 0.035);

      const groundH = terrainY(pos.x, pos.z);
      const bob = moving ? Math.sin(bobPhase) * 0.055 : Math.sin(brTime * 1.4) * 0.012;
      pos.y = groundH + 1.68 + bob;

      // Update camera + wrapped entities + atmosphere
      brCamera.position.copy(pos);
      brCamera.rotation.order = 'YXZ';
      brCamera.rotation.y = yaw;
      brCamera.rotation.x = pitch;
      skySphere.position.copy(pos);
      starPoints.position.copy(pos);
      starMat.uniforms.uTime.value = brTime;

      wrapWorldEntities();
      syncAtmosphereLighting();

      // Animate 3D Wisteria Watcher (standing eerily still, staring at player, horror head twitches, vanish on < 11.5m)
      if (watcherVisible) {
        const wDist = Math.hypot(watcherPos.x - pos.x, watcherPos.z - pos.z);
        if (wDist < 11.5) {
          watcherVisible = false;
          watcherGroup.visible = false;
          watcherGlow.intensity = 0;
          watcherDisappearCount++;
          watcherRespawnTimer = 2.8;
          playStaticVanishSfx();
        } else {
          watcherPos.y = terrainY(watcherPos.x, watcherPos.z);
          watcherGroup.position.copy(watcherPos);
          // Model faces +Z in local holder, so atan2(dx, dz) points her straight at player
          watcherGroup.rotation.y = Math.atan2(pos.x - watcherPos.x, pos.z - watcherPos.z);

          // Horror head & neck sudden erratic twitches
          twitchTimer -= dt;
          if (twitchTimer <= 0) {
            twitchHold = 0.07 + Math.random() * 0.11;
            twitchNeckZ = (Math.random() > 0.5 ? 1 : -1) * (0.26 + Math.random() * 0.42);
            twitchHeadY = (Math.random() - 0.5) * 0.55;
            twitchHeadZ = (Math.random() - 0.5) * 0.35;
            twitchTimer = 0.42 + Math.random() * 1.35;
          }
          if (twitchHold > 0) {
            twitchHold -= dt;
          } else {
            twitchNeckZ *= Math.max(0, 1 - dt * 22);
            twitchHeadY *= Math.max(0, 1 - dt * 22);
            twitchHeadZ *= Math.max(0, 1 - dt * 22);
          }
          if (wBones.neck && bindQ.neckLocal) {
            wBones.neck.quaternion.copy(bindQ.neckLocal).multiply(
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0, twitchNeckZ))
            );
          }
          if (wBones.head && bindQ.headLocal) {
            wBones.head.quaternion.copy(bindQ.headLocal).multiply(
              new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.04, twitchHeadY, twitchHeadZ))
            );
          }
          watcherGroup.visible = watcherLoaded;
          watcherGlow.position.set(watcherPos.x, watcherPos.y + 1.55, watcherPos.z);
          watcherGlow.intensity = darkness * 0.85;
        }
      } else {
        watcherRespawnTimer -= dt;
        if (watcherRespawnTimer <= 0) {
          placeWatcherOnHill(pos.x, pos.z, 26, 42);
          watcherVisible = true;
          watcherGroup.visible = watcherLoaded;
        }
      }

      skyPlainsMat.uniforms.uTime.value = brTime;
      groundMat.uniforms.uCenterX.value = pos.x;
      groundMat.uniforms.uCenterZ.value = pos.z;
      groundMat.uniforms.uCameraPos.value.copy(pos);
      grassMat.uniforms.uTime.value = brTime;
      grassMat.uniforms.uCenterX.value = pos.x;
      grassMat.uniforms.uCenterZ.value = pos.z;
      grassMat.uniforms.uCameraPos.value.copy(pos);
    }

    function onKeyDown(e) {
      if (!active) return;
      if (e.code === 'Escape') {
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock?.();
          return;
        }
        e.preventDefault();
        exit();
        return;
      }
      keys[e.code] = true;
    }

    function onKeyUp(e) {
      keys[e.code] = false;
    }

    function onPointerLockChange() {
      pointerLocked = document.pointerLockElement === canvas;
      if (!pointerLocked) {
        lastMouseX = null;
        lastMouseY = null;
      }
    }

    function onPointerMove(e) {
      if (!active) return;
      if (pointerLocked || document.pointerLockElement === canvas) {
        yaw -= e.movementX * 0.0026;
        pitch = Math.max(-1.25, Math.min(1.2, pitch - e.movementY * 0.0024));
        return;
      }
      if (e.target && e.target.closest && e.target.closest('#backroomsHud')) {
        lastMouseX = null;
        lastMouseY = null;
        return;
      }
      if (lastMouseX === null || lastMouseY === null) {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        return;
      }
      let dx = e.clientX - lastMouseX;
      let dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      dx = Math.max(-90, Math.min(90, dx));
      dy = Math.max(-90, Math.min(90, dy));
      yaw -= dx * 0.0032;
      pitch = Math.max(-1.25, Math.min(1.2, pitch - dy * 0.0028));
    }

    function onCanvasClick() {
      if (!active) return;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {}
      }
    }

    let touchPrev = null;
    function onTouchStart(e) {
      if (!active || !e.touches[0]) return;
      touchPrev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    function onTouchMove(e) {
      if (!active || !touchPrev || !e.touches[0]) return;
      const dx = e.touches[0].clientX - touchPrev.x;
      const dy = e.touches[0].clientY - touchPrev.y;
      touchPrev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      yaw -= dx * 0.004;
      pitch = Math.max(-1.25, Math.min(1.2, pitch - dy * 0.0035));
    }
    function onTouchEnd() { touchPrev = null; }

    function attachListeners() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      document.addEventListener('pointerlockchange', onPointerLockChange);
      canvas.addEventListener('click', onCanvasClick);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('touchstart', onTouchStart, { passive: true });
      canvas.addEventListener('touchmove', onTouchMove, { passive: true });
      canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    }

    function detachListeners() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }
    }

    function enter() {
      active = true;
      keys = Object.create(null);
      wrapCount = 0;
      loopDistance = 0;
      darkness = 0;
      watcherVisible = true;
      watcherDisappearCount = 0;
      watcherRespawnTimer = 0;

      pos.set(0, terrainY(0, 0) + 1.68, 0);
      yaw = 0.06;
      pitch = -0.02;
      lastMouseX = null;
      lastMouseY = null;

      placeWatcherOnHill(0, 0, 26, 36);
      watcherGroup.visible = watcherLoaded;
      syncAtmosphereLighting();
      if (hudEl) hudEl.classList.add('is-active');
      attachListeners();
      startAmbience();
    }

    function exit() {
      if (!active) return;
      active = false;
      watcherGroup.visible = false;
      detachListeners();
      stopAmbience();
      if (hudEl) hudEl.classList.remove('is-active');
      onExit();
    }

    function update(dt) {
      if (!active) return false;
      stepSimulation(dt);
      renderer.render(brScene, brCamera);
      return true;
    }

    function stepForTest(dz, dYaw, dtSim, directStepX, directStepZ) {
      if (!active) return;
      if (typeof dYaw === 'number') yaw += dYaw;
      if (typeof directStepX === 'number' || typeof directStepZ === 'number') {
        stepSimulation(dtSim || 0.04, directStepX, directStepZ);
      } else if (dz) {
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        stepSimulation(dtSim || 0.05, fx * dz, fz * dz);
      } else {
        stepSimulation(dtSim || 0.04, 0, 0);
      }
      renderer.render(brScene, brCamera);
    }

    function getDebugState() {
      const nh = getNearestHouseWorld(pos.x, pos.z);
      return {
        pos: { x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2) },
        yaw: +yaw.toFixed(3),
        pitch: +pitch.toFixed(3),
        pointerLocked,
        wrapCount,
        loopDistance: +loopDistance.toFixed(1),
        darkness: +darkness.toFixed(3),
        watcherLoaded,
        watcherVisible,
        watcherDisappearCount,
        watcherPos: {
          x: +watcherPos.x.toFixed(2),
          y: +watcherPos.y.toFixed(2),
          z: +watcherPos.z.toFixed(2),
        },
        nearestHouse: nh ? { x: +nh.x.toFixed(2), z: +nh.z.toFixed(2), rot: +nh.rot.toFixed(3), dist: +nh.dist.toFixed(2) } : null,
        insideAnyHouse: isInsideAnyHouse(pos.x, pos.z),
        houseCount: housePlacements.length,
      };
    }

    function resize(w, h) {
      brCamera.aspect = Math.max(1, w) / Math.max(1, h);
      brCamera.updateProjectionMatrix();
    }

    return {
      enter,
      setRealm: () => {},
      stepForTest,
      getDebugState,
      exit,
      isActive: () => active,
      getRealm: () => 'plains',
      update,
      resize,
    };
  }

  global.WisteriaBackrooms = { create };
})(window);
