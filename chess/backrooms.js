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

  // Merge an array of BufferGeometries (position + normal) into one non-indexed BufferGeometry
  function mergeBakedGeos(list) {
    let totalVerts = 0;
    const expanded = [];
    for (let i = 0; i < list.length; i++) {
      const g = list[i].index ? list[i].toNonIndexed() : list[i];
      const pos = g.attributes.position;
      if (!pos) continue;
      if (!g.attributes.normal) g.computeVertexNormals();
      totalVerts += pos.count;
      expanded.push(g);
    }
    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);
    let offset = 0;
    for (let i = 0; i < expanded.length; i++) {
      const p = expanded[i].attributes.position.array;
      const n = expanded[i].attributes.normal.array;
      positions.set(p, offset);
      normals.set(n, offset);
      offset += p.length;
      expanded[i].dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    const colors = new Float32Array(totalVerts * 3);
    colors.fill(1);
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return merged;
  }

  // Bake all house sub-parts into 7 merged BufferGeometries (1 per material/part) for InstancedMesh rendering
  function buildHouseTemplateGeometries() {
    const w = 6.8;
    const h = 6.4;
    const d = 8.2;
    const ridgeH = 3.1;
    const foundDepth = 5.2;

    const buckets = { wall: [], sideWall: [], trim: [], roof: [], glass: [], door: [], fence: [] };
    const tmpObj = new THREE.Object3D();
    function pushGeo(bucket, geo, px, py, pz, rx, ry, rz, parentMat) {
      tmpObj.position.set(px || 0, py || 0, pz || 0);
      tmpObj.rotation.set(rx || 0, ry || 0, rz || 0);
      tmpObj.scale.set(1, 1, 1);
      tmpObj.updateMatrix();
      const mat = parentMat ? parentMat.clone().multiply(tmpObj.matrix) : tmpObj.matrix;
      geo.applyMatrix4(mat);
      buckets[bucket].push(geo);
    }

    pushGeo('wall', new THREE.BoxGeometry(w + 0.16, foundDepth, d + 0.16), 0, -foundDepth * 0.5 + 0.15, 0);
    pushGeo('trim', new THREE.BoxGeometry(w + 0.24, 0.26, d + 0.24), 0, 0.13, 0);
    pushGeo('wall', new THREE.BoxGeometry(w, h, d), 0, h * 0.5, 0);

    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        pushGeo('trim', new THREE.BoxGeometry(0.18, h + 0.08, 0.18), sx * (w * 0.5 + 0.02), h * 0.5, sz * (d * 0.5 + 0.02));
      }
    }

    const gableShape = new THREE.Shape();
    gableShape.moveTo(-w * 0.5, 0);
    gableShape.lineTo(0, ridgeH);
    gableShape.lineTo(w * 0.5, 0);
    gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: d, bevelEnabled: false });
    gableGeo.translate(0, 0, -d * 0.5);
    pushGeo('sideWall', gableGeo, 0, h, 0);

    const slopeLen = Math.hypot(w * 0.5 + 0.55, ridgeH) + 0.2;
    const slopeAngle = Math.atan2(ridgeH, w * 0.5);
    [-1, 1].forEach((side) => {
      pushGeo('roof', new THREE.BoxGeometry(slopeLen, 0.22, d + 0.8), side * (w * 0.25 + 0.14), h + ridgeH * 0.5 - 0.08, 0, 0, 0, -side * slopeAngle);
      pushGeo('trim', new THREE.BoxGeometry(slopeLen, 0.24, 0.14), side * (w * 0.25 + 0.14), h + ridgeH * 0.5 - 0.13, d * 0.5 + 0.36, 0, 0, -side * slopeAngle);
      pushGeo('trim', new THREE.BoxGeometry(slopeLen, 0.24, 0.14), side * (w * 0.25 + 0.14), h + ridgeH * 0.5 - 0.13, -d * 0.5 - 0.36, 0, 0, -side * slopeAngle);
    });
    pushGeo('trim', new THREE.BoxGeometry(0.24, 0.18, d + 0.84), 0, h + ridgeH + 0.04, 0);

    const winParent = new THREE.Object3D();
    function addWindow(x, y, z, rotY, winW, winH) {
      winParent.position.set(x, y, z);
      winParent.rotation.set(0, rotY, 0);
      winParent.updateMatrix();
      const pm = winParent.matrix;
      pushGeo('trim', new THREE.BoxGeometry(winW + 0.24, winH + 0.24, 0.1), 0, 0, 0, 0, 0, 0, pm);
      pushGeo('glass', new THREE.BoxGeometry(winW, winH, 0.12), 0, 0, 0.01, 0, 0, 0, pm);
      pushGeo('trim', new THREE.BoxGeometry(0.06, winH, 0.14), 0, 0, 0.02, 0, 0, 0, pm);
      pushGeo('trim', new THREE.BoxGeometry(winW, 0.06, 0.14), 0, -0.22 * winH, 0.02, 0, 0, 0, pm);
      pushGeo('trim', new THREE.BoxGeometry(winW, 0.06, 0.14), 0, 0.22 * winH, 0.02, 0, 0, 0, pm);
      pushGeo('trim', new THREE.BoxGeometry(winW + 0.36, 0.11, 0.2), 0, -winH * 0.5 - 0.08, 0.05, 0, 0, 0, pm);
    }

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
        pushGeo('trim', new THREE.BoxGeometry(1.52, 2.7, 0.1), 0, 1.35, zPos + 0.03);
        pushGeo('door', new THREE.BoxGeometry(1.26, 2.48, 0.13), 0, 1.35, zPos + 0.04);
      }
    });

    [-1, 1].forEach((fx) => {
      const rot = fx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      const xPos = fx * (w * 0.5 + 0.04);
      [-2.1, 0.0, 2.1].forEach((oz) => {
        addWindow(xPos, 2.15, oz, rot, 0.92, 1.38);
        addWindow(xPos, 4.45, oz, rot, 0.92, 1.32);
      });
    });

    for (let i = -3; i <= 3; i++) {
      if (Math.abs(i) < 1) continue;
      pushGeo('fence', new THREE.BoxGeometry(0.11, 0.96, 0.06), i * 0.92, 0.42, d * 0.5 + 1.45);
    }
    [-1, 1].forEach((s) => {
      pushGeo('fence', new THREE.BoxGeometry(2.1, 0.07, 0.05), s * 2.15, 0.68, d * 0.5 + 1.45);
    });

    return {
      wall: mergeBakedGeos(buckets.wall),
      sideWall: mergeBakedGeos(buckets.sideWall),
      trim: mergeBakedGeos(buckets.trim),
      roof: mergeBakedGeos(buckets.roof),
      glass: mergeBakedGeos(buckets.glass),
      door: mergeBakedGeos(buckets.door),
      fence: mergeBakedGeos(buckets.fence),
    };
  }

  function buildWaterTowerTemplateGeometries() {
    const legs = [];
    const tmpObj = new THREE.Object3D();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      const legGeo = new THREE.CylinderGeometry(0.12, 0.16, 11.4, 6);
      tmpObj.position.set(Math.cos(a) * 1.45, 5.4, Math.sin(a) * 1.45);
      tmpObj.rotation.set(Math.sin(a) * 0.06, 0, -Math.cos(a) * 0.06);
      tmpObj.scale.set(1, 1, 1);
      tmpObj.updateMatrix();
      legGeo.applyMatrix4(tmpObj.matrix);
      legs.push(legGeo);
    }
    const tankGeo = new THREE.CylinderGeometry(1.75, 1.75, 3.2, 14);
    tankGeo.translate(0, 12.1, 0);
    const roofGeo = new THREE.ConeGeometry(1.9, 1.25, 14);
    roofGeo.translate(0, 14.3, 0);
    return {
      steel: mergeBakedGeos(legs),
      tank: tankGeo,
      cone: roofGeo,
    };
  }

  // Exact bone alignment helper so GLB Mixamo arms orient cleanly in world or character-rotated space
  function pointBoneWorld(bone, targetChild, bindParentWorldQ, bindDirWorld, desiredDirWorld, strength, charRotQ) {
    if (!bone || !bone.parent || !targetChild || !bindParentWorldQ || !bindDirWorld) return;
    const invCurParent = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(invCurParent).invert();
    let refDir = bindDirWorld;
    let refQ = bindParentWorldQ;
    if (charRotQ) {
      refDir = bindDirWorld.clone().applyQuaternion(charRotQ).normalize();
      refQ = charRotQ.clone().multiply(bindParentWorldQ);
    }
    const delta = new THREE.Quaternion().setFromUnitVectors(refDir, desiredDirWorld.clone().normalize());
    const targetWorldQ = delta.multiply(refQ);
    const targetLocalQ = invCurParent.multiply(targetWorldQ);
    bone.quaternion.slerp(targetLocalQ, strength);
  }

  // Shared loader helper for both Plains 3D Wisteria Watcher and Level 0 3D Chaser
  function prepareKurizuRig(gltf, targetHeight, emissiveHex, emissiveIntensity) {
    const holder = new THREE.Group();
    const raw = gltf.scene;
    raw.updateMatrixWorld(true);

    const boneMap = {};
    const materials = [];
    raw.traverse((o) => {
      if (o.isBone) boneMap[o.name] = o;
      if (o.isMesh) {
        o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const next = mats.map((m) => {
          const std = new THREE.MeshStandardMaterial({
            map: m.map || null,
            color: m.map ? new THREE.Color(0xffffff) : m.color ? m.color.clone() : new THREE.Color(0xd8b4fe),
            emissive: m.map ? new THREE.Color(emissiveHex) : new THREE.Color(emissiveHex),
            emissiveMap: m.map || null,
            emissiveIntensity,
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
          materials.push(std);
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

    const bones = {
      hips: pick('mixamorigHips', 'hips'),
      spine: pick('mixamorigSpine', 'spine'),
      spine1: pick('mixamorigSpine1', 'spine1'),
      neck: pick('mixamorigNeck', 'neck'),
      head: pick('mixamorigHead', 'head'),
      lArm: pick('mixamorigLeftArm', 'leftarm'),
      lFore: pick('mixamorigLeftForeArm', 'leftforearm'),
      lHand: pick('mixamorigLeftHand', 'lefthand'),
      rArm: pick('mixamorigRightArm', 'rightarm'),
      rFore: pick('mixamorigRightForeArm', 'rightforearm'),
      rHand: pick('mixamorigRightHand', 'righthand'),
      lUpLeg: pick('mixamorigLeftUpLeg', 'leftupleg'),
      lLeg: pick('mixamorigLeftLeg', 'leftleg'),
      rUpLeg: pick('mixamorigRightUpLeg', 'rightupleg'),
      rLeg: pick('mixamorigRightLeg', 'rightleg'),
    };

    const box = new THREE.Box3();
    const pt = new THREE.Vector3();
    Object.keys(boneMap).forEach((k) => {
      boneMap[k].getWorldPosition(pt);
      box.expandByPoint(pt);
    });
    const rawHeight = Math.max(0.001, (box.max.y - box.min.y) * 1.42);
    const scale = targetHeight / rawHeight;
    raw.scale.setScalar(scale);
    raw.position.set(0, -box.min.y * scale + 0.06, 0);
    holder.add(raw);
    holder.updateMatrixWorld(true);

    const bindQ = {};
    const bindDir = {};
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
      if (dir.lengthSq() > 1e-6) bindDir[key] = dir.normalize();
    };
    recordChain('lArm', bones.lArm, bones.lFore);
    recordChain('lFore', bones.lFore, bones.lHand);
    recordChain('rArm', bones.rArm, bones.rFore);
    recordChain('rFore', bones.rFore, bones.rHand);

    ['hips', 'spine', 'spine1', 'neck', 'head', 'lUpLeg', 'lLeg', 'rUpLeg', 'rLeg'].forEach((k) => {
      if (bones[k]) bindQ[`${k}Local`] = bones[k].quaternion.clone();
    });
    if (bones.hips) {
      bindQ.hipsPosY = bones.hips.position.y;
      bindQ.hipsPos = bones.hips.position.clone();
    }

    return { holder, bones, bindQ, bindDir, materials, raw };
  }

  function create(opts) {
    const renderer = opts.renderer;
    const canvas = opts.canvas;
    const hudEl = opts.hudEl;
    const dangerEl = opts.dangerEl || null;
    const jumpscareEl = opts.jumpscareEl || null;
    const onCaughtCloseSite = opts.onCaughtCloseSite || (() => {});
    const onPcRestartReset = opts.onPcRestartReset || (() => {});
    const onExit = opts.onExit || (() => {});
    const getAudio = opts.getAudio || (() => null);

    let active = false;
    let currentRealm = 'plains';
    let pointerLocked = false;
    let lastMouseX = null;
    let lastMouseY = null;
    let brTime = 0;

    // Player & chest-mounted body-cam state (rig lag + spring inertia + wide FOV)
    const BODYCAM_BASE_FOV = 94;
    const BODYCAM_IR_FOV = 80;
    const pos = new THREE.Vector3(0, terrainY(0, 0) + 1.68, 0);
    let yaw = 0.06;
    let pitch = -0.02;
    let bobPhase = 0;
    let camMoveBlend = 0;
    let camSprintBlend = 0;
    let camRollCur = 0;
    let camLatCur = 0;
    let camPitchBobCur = 0;
    const camLagPos = new THREE.Vector3();
    let camLagYaw = 0.06;
    let camLagPitch = -0.02;
    let camLagInit = false;
    let camTurnRollCur = 0;
    let camFovCur = BODYCAM_BASE_FOV;
    let fallActive = false;
    let fallVy = 0;
    let fallPassedCeiling = false;
    let landRecoverTimer = 0;
    const LAND_RECOVER_DUR = 0.75;
    let fallRollPhase = 0;
    let keys = Object.create(null);

    // Mobile virtual joystick & sprint state
    const joyBase = hudEl ? hudEl.querySelector('#brJoyBase') : null;
    const joyKnob = hudEl ? hudEl.querySelector('#brJoyKnob') : null;
    const sprintBtn = hudEl ? hudEl.querySelector('#brSprintBtn') : null;
    const hintLabel = hudEl ? hudEl.querySelector('#brHintLabel') : null;
    const levelLabel = hudEl ? hudEl.querySelector('#brLevelLabel') : null;
    const flashBtn = hudEl ? hudEl.querySelector('#brFlashBtn') : null;
    const camViewEl = hudEl ? hudEl.querySelector('#brCamViewfinder') : null;
    const stareFillEl = hudEl ? hudEl.querySelector('#brStareFill') : null;
    const pcBtn = hudEl ? hudEl.querySelector('#brPcBtn') : null;
    const jumpscareSpanEl = jumpscareEl ? jumpscareEl.querySelector('span') : null;
    const vhsStampEl = hudEl ? hudEl.querySelector('#brVhsStamp') : null;
    let lastVhsStampKey = '';
    let vhsGlitchSpike = 0;
    let l0CamViewUniform = 0;
    let lastSceneRenderCalls = 0;
    let joyPointerId = null;
    let joyX = 0; // -1..1 strafe
    let joyY = 0; // -1..1 forward (positive = forward)
    let mobileSprint = false;

    // Wrapping & progressive darkness state
    let wrapCount = 0;
    let loopDistance = 0;
    let darkness = 0;

    // 3D Wisteria Watcher state
    let watcherLoaded = false;
    let watcherVisible = true;
    let watcherDisappearCount = 0;
    let watcherFollowCount = 0;
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
    // Fog removed on Plains so far-distance hills & houses render crystal clear with view-frustum culling
    brScene.fog = null;

    const brCamera = new THREE.PerspectiveCamera(
      BODYCAM_BASE_FOV,
      Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight),
      0.08,
      380
    );

    // Lightweight VHS / Found-Footage post-processing pass (shared by Plains and Level 0)
    function getVhsTargetSize(w, h) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      return {
        w: Math.max(320, Math.floor(Math.max(1, w) * dpr * 0.85)),
        h: Math.max(180, Math.floor(Math.max(1, h) * dpr * 0.85)),
      };
    }
    const initVhsSz = getVhsTargetSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    const vhsTarget = new THREE.WebGLRenderTarget(initVhsSz.w, initVhsSz.h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    const vhsPostScene = new THREE.Scene();
    const vhsPostCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const vhsPostMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: vhsTarget.texture },
        uTime: { value: 0 },
        uIntensity: { value: 1.0 },
        uRealm: { value: 0.0 },
        uCamView: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(initVhsSz.w, initVhsSz.h) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uRealm;
        uniform float uCamView;
        uniform vec2 uResolution;
        varying vec2 vUv;

        float vhsHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          // Wide-angle fisheye barrel lens distortion (aspect-balanced for desktop & mobile)
          vec2 cUv = vUv - 0.5;
          float aspect = uResolution.x / max(1.0, uResolution.y);
          vec2 radial = cUv * vec2(mix(1.0, aspect, 0.34), 1.0);
          float r2 = dot(radial, radial);
          float r4 = r2 * r2;
          float fishK1 = mix(0.42, 0.28, uCamView);
          float fishK2 = mix(0.32, 0.20, uCamView);
          float fishScale = mix(0.78, 0.84, uCamView);
          vec2 uv = cUv * (1.0 + fishK1 * r2 + fishK2 * r4) * fishScale + 0.5;
          float lensEdge = length(radial);
          float lensMask = 1.0 - smoothstep(0.64, 0.78, lensEdge);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || lensMask <= 0.002) {
            gl_FragColor = vec4(0.006, 0.005, 0.008, 1.0);
            return;
          }

          // Slow VHS tracking bar + subtle scanline jitter + bottom head-switching band
          float barCenter = fract(uTime * 0.085);
          float barDist = abs(uv.y - barCenter);
          float barGate = 0.32 + 0.68 * step(0.65, sin(uTime * 0.85));
          float trackingBand = smoothstep(0.032, 0.0, barDist) * barGate * uIntensity;
          float lineNoise = (vhsHash(vec2(floor(uv.y * 260.0), floor(uTime * 24.0))) - 0.5);
          float microJitter = sin(uv.y * 195.0 + uTime * 11.5) * 0.0005 * uIntensity;
          float headSwitch = smoothstep(0.028, 0.0, uv.y);

          vec2 sampleUv = uv;
          sampleUv.x += microJitter;
          sampleUv.x += lineNoise * trackingBand * 0.014;
          sampleUv.x += lineNoise * headSwitch * (0.018 * uIntensity);
          sampleUv = clamp(sampleUv, 0.001, 0.999);

          // Radial fisheye chromatic dispersion + analog chroma smear
          vec2 caRadial = cUv * (0.0042 + 0.022 * r2) * uIntensity + vec2(trackingBand * 0.0042, 0.0);
          float r = texture2D(tDiffuse, clamp(sampleUv + caRadial, 0.001, 0.999)).r;
          vec3 centerTap = texture2D(tDiffuse, sampleUv).rgb;
          float b = texture2D(tDiffuse, clamp(sampleUv - caRadial * vec2(1.0, 0.85), 0.001, 0.999)).b;
          vec3 smearTap = texture2D(tDiffuse, clamp(sampleUv - vec2(0.0028, 0.0), 0.001, 0.999)).rgb;

          vec3 col = mix(vec3(r, centerTap.g, b), smearTap, 0.14);
          col = pow(max(col, vec3(0.0)), vec3(0.92));

          // Tracking snow & bottom head-switching static streaks
          float snow = vhsHash(vec2(floor(uv.x * uResolution.x * 0.5), floor(uv.y * uResolution.y) + floor(uTime * 30.0)));
          col += vec3(snow) * trackingBand * 0.16;
          col = mix(col, vec3(snow * 0.65 + 0.18), headSwitch * step(0.62, snow) * 0.55);

          // CRT scanlines + animated CMOS sensor grain
          float scan = 1.0 - (0.055 + 0.03 * uRealm) * (0.5 + 0.5 * sin(uv.y * uResolution.y * 1.15));
          float grain = (vhsHash(floor(uv.xy * uResolution * 0.68) + vec2(fract(uTime * 19.3) * 100.0, 0.0)) - 0.5) * (0.048 + 0.046 * uIntensity);
          col = col * scan + grain;

          // Body-cam CMOS color grading: filmic contrast blend (keeps dark halls readable), cool shadows + IR mode
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(luma), col, mix(0.76, 0.72, uRealm));
          col = mix(col, smoothstep(vec3(0.0), vec3(0.96), col), 0.36);
          vec3 shadowCool = mix(vec3(-0.005, 0.004, 0.014), vec3(0.002, 0.008, 0.004), uRealm);
          vec3 highWarm = mix(vec3(0.99, 0.98, 0.95), vec3(1.02, 0.99, 0.88), uRealm);
          col = col * highWarm + shadowCool * (1.0 - smoothstep(0.0, 0.45, luma));
          if (uCamView > 0.001) {
            float irLuma = pow(clamp(luma * 1.48 + 0.025, 0.0, 1.0), 0.86);
            vec3 irTint = mix(col * vec3(0.76, 1.12, 0.90), vec3(irLuma * 0.62, irLuma * 1.06, irLuma * 0.78), 0.45);
            col = mix(col, irTint + grain * 0.75, uCamView);
          }

          // Deep optical body-cam lens vignette & rounded bezel fade
          float optVig = smoothstep(0.94, mix(0.22, 0.16, uCamView), length(radial * vec2(1.14, 1.10)));
          float cornerDark = 1.0 - smoothstep(0.30, 0.76, r2) * 0.34;
          col *= mix(0.26, 1.0, optVig) * cornerDark * lensMask;

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const vhsPostQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), vhsPostMat);
    vhsPostQuad.frustumCulled = false;
    vhsPostScene.add(vhsPostQuad);

    const ambientLight = new THREE.AmbientLight(0xc8def4, 0.48);
    const hemiLight = new THREE.HemisphereLight(0x9fd0ff, 0x32401b, 0.70);
    const sunLight = new THREE.DirectionalLight(0xffe9c2, 1.08);
    sunLight.position.set(18, 28, -40);
    const flashlight = new THREE.PointLight(0xdfecff, 0, 28, 1.35);
    const watcherGlow = new THREE.PointLight(0xd8b4fe, 0, 9.5, 1.6);

    brScene.add(ambientLight, hemiLight, sunLight, flashlight, watcherGlow);

    // Level 94 Rich Sunlit Clouded Daylight Sky -> Midnight Starry Sky on Looping
    const skyPlainsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDarkness: { value: 0 },
        uFogColor: { value: liveFogColor.clone() },
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
        uniform vec3 uFogColor;
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
          float s = 0.0; float a = 0.52;
          for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.04; a *= 0.49; }
          return s;
        }
        float fbmLow(vec2 p) {
          float s = 0.0; float a = 0.54;
          for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.04; a *= 0.49; }
          return s;
        }
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, -0.1, 1.0);

          vec3 dayZenith = vec3(0.28, 0.54, 0.84);
          vec3 dayMid = vec3(0.56, 0.74, 0.90);
          vec3 dayHorizon = vec3(0.84, 0.88, 0.90);
          vec3 duskZenith = vec3(0.11, 0.14, 0.28);
          vec3 duskHorizon = vec3(0.32, 0.28, 0.38);
          vec3 nightZenith = vec3(0.012, 0.014, 0.040);
          vec3 nightHorizon = vec3(0.040, 0.036, 0.080);

          float d1 = clamp(uDarkness * 2.0, 0.0, 1.0);
          float d2 = clamp(uDarkness * 2.0 - 1.0, 0.0, 1.0);
          vec3 skyZenith = mix(mix(dayZenith, duskZenith, d1), nightZenith, d2);
          vec3 skyHorizon = mix(mix(dayHorizon, duskHorizon, d1), nightHorizon, d2);
          vec3 sky = mix(skyHorizon, mix(dayMid, skyZenith, clamp(uDarkness, 0.0, 1.0)), smoothstep(0.0, 0.28, max(0.0, h)));
          sky = mix(sky, skyZenith, smoothstep(0.18, 0.85, max(0.0, h)));

          // Atmospheric Mie sun scatter + crisp solar disc
          vec3 sunDir = normalize(vec3(0.24, 0.48, -0.84));
          float sunAmt = max(0.0, dot(dir, sunDir));
          float sunScale = mix(1.0, 0.06, smoothstep(0.15, 0.85, uDarkness));
          sky += vec3(1.0, 0.90, 0.72) * pow(sunAmt, 6.0) * 0.22 * sunScale;
          sky += vec3(1.0, 0.95, 0.84) * pow(sunAmt, 36.0) * 0.42 * sunScale;
          sky += vec3(1.0, 0.99, 0.94) * smoothstep(0.9965, 0.9994, sunAmt) * 0.90 * sunScale;

          if (h > 0.012) {
            vec2 uv = dir.xz / (h + 0.15) * 1.38 + vec2(uTime * 0.010, uTime * 0.004);
            float c = fbm(uv);
            float cSun = fbmLow(uv + normalize(sunDir.xz) * 0.12);
            float cMask = smoothstep(0.44, 0.78, c) * smoothstep(0.012, 0.13, h);
            float rim = clamp((c - cSun) * 2.8 + 0.55, 0.0, 1.0);
            vec3 cloudShade = vec3(0.68, 0.75, 0.84);
            vec3 cloudLit = vec3(1.0, 0.985, 0.95) + vec3(0.18, 0.12, 0.04) * pow(sunAmt, 4.0);
            vec3 cloudCol = mix(cloudShade, cloudLit, smoothstep(0.15, 0.88, rim));
            cloudCol = mix(cloudCol, vec3(0.09, 0.09, 0.15), smoothstep(0.15, 0.92, uDarkness));
            sky = mix(sky, cloudCol, cMask * mix(0.92, 0.36, uDarkness));
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

    // Infinite wrapping far-distance rolling meadow terrain (centered on camera, ±180m)
    const groundGeo = new THREE.PlaneGeometry(360, 360, 96, 96);
    groundGeo.rotateX(-Math.PI * 0.5);
    const groundMat = new THREE.ShaderMaterial({
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
        uniform float uTime;
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
          float nMacro = vnoise(vWorld.xz * 0.06);
          float n1 = vnoise(vWorld.xz * 0.28);
          float n2 = vnoise(vWorld.xz * 2.4);
          float nFine = vnoise(vWorld.xz * 9.5);

          // Rich sunlit meadow palette: cool deep valleys -> lush emerald -> golden hilltop patches
          float hillCrest = smoothstep(-0.6, 2.2, vWorld.y);
          vec3 valleyGreen = vec3(0.095, 0.165, 0.048);
          vec3 meadowGreen = vec3(0.20, 0.32, 0.082);
          vec3 sunlitHill = vec3(0.32, 0.41, 0.125);
          vec3 soilMoss = mix(valleyGreen, meadowGreen, clamp(n1 * 0.65 + n2 * 0.35, 0.0, 1.0));
          soilMoss = mix(soilMoss, sunlitHill, hillCrest * 0.42 + nMacro * 0.28);
          soilMoss *= (0.90 + 0.18 * nFine);

          float dxRoad = abs(vWorld.x - roadCenterX(vWorld.z));
          float asphaltMask = 1.0 - smoothstep(1.9, 2.35, dxRoad);
          float shoulderMask = (1.0 - smoothstep(2.2, 3.15, dxRoad)) * (1.0 - asphaltMask);

          vec3 roadCol = mix(vec3(0.11, 0.115, 0.125), vec3(0.21, 0.20, 0.19), n2 * 0.6 + nFine * 0.4);
          float centerLine = (1.0 - smoothstep(0.04, 0.09, dxRoad)) * step(0.45, fract(vWorld.z * 0.18));
          roadCol = mix(roadCol, vec3(0.84, 0.80, 0.66), centerLine * 0.62);

          vec3 col = mix(soilMoss, vec3(0.27, 0.24, 0.15), shoulderMask * 0.72);
          col = mix(col, roadCol, asphaltMask);

          // Warm golden sun + cool sky hemisphere bounce + drifting cloud shadows
          vec3 N = normalize(vNorm);
          vec3 V = normalize(uCameraPos - vWorld);
          vec3 sunDir = normalize(vec3(0.24, 0.56, -0.79));
          float diff = max(0.0, dot(N, sunDir));
          float cloudN = vnoise(vWorld.xz * 0.022 + vec2(uTime * 0.045, uTime * 0.020));
          float cloudShadow = mix(0.74, 1.08, smoothstep(0.32, 0.72, cloudN));
          vec3 skyFill = vec3(0.46, 0.62, 0.82) * (0.36 + 0.22 * N.y);
          vec3 sunContrib = vec3(1.08, 0.98, 0.82) * diff * 0.92 * cloudShadow;

          // Subtle asphalt sun sheen
          vec3 H = normalize(sunDir + V);
          float roadSpec = pow(max(0.0, dot(N, H)), 24.0) * asphaltMask * 0.28 * (1.0 - uDarkness) * cloudShadow;

          float dayLight = mix(1.0, 0.14, uDarkness);
          float dist = length(vWorld - uCameraPos);
          float torch = uDarkness * exp(-dist * 0.088) * 0.62;
          col = col * ((skyFill + sunContrib) * dayLight + vec3(torch)) + vec3(1.0, 0.95, 0.84) * roadSpec;

          // Gentle blue aerial perspective at far distance (no heavy fog) + smooth edge fade at 180m
          vec3 aerialCol = mix(vec3(0.62, 0.76, 0.88), uFogColor, uDarkness);
          col = mix(col, aerialCol, smoothstep(55.0, 175.0, dist) * 0.34);
          float edgeFade = smoothstep(148.0, 178.0, dist);
          col = mix(col, uFogColor, clamp(edgeFade, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.frustumCulled = false;
    brScene.add(groundMesh);

    // 28,000 Lush Thicker Tall Curved Shader Grass Blades (48m x 48m forward-biased carpet, behind-player culled, 2-seg fast GPU)
    const GRASS_COUNT = 28000;
    const GRASS_SPAN = 48.0;
    const SEGS = 2; // 4 triangles per blade for smooth graceful arch at high FPS
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
        uCamFwdXZ: { value: new THREE.Vector2(0, -1) },
      },
      vertexShader: `
        attribute vec3 aOffset;
        attribute vec4 aBladeMeta;
        attribute float aBladeY;
        uniform float uTime;
        uniform float uCenterX;
        uniform float uCenterZ;
        uniform vec3 uCameraPos;
        uniform vec2 uCamFwdXZ;
        varying float vH;
        varying float vTone;
        varying vec3 vWorldPos;
        varying float vRoadMask;
        varying float vCloudShadow;
        varying float vWindWave;
        ${GLSL_TERRAIN}
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x),
            mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        void main() {
          float span = 48.0;
          float wx = mod(aOffset.x - uCenterX + span * 0.5, span) - span * 0.5 + uCenterX;
          float wz = mod(aOffset.z - uCenterZ + span * 0.5, span) - span * 0.5 + uCenterZ;

          // Derender grass blades outside/behind the wide fisheye view cone
          vec2 fromPlayer = vec2(wx, wz) - uCameraPos.xz;
          float pDist = length(fromPlayer) + 0.001;
          if (pDist > 2.6 && dot(fromPlayer / pDist, uCamFwdXZ) < 0.14) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }

          float dxRoad = abs(wx - roadCenterX(wz));
          vRoadMask = smoothstep(2.05, 3.05, dxRoad);

          float wy = terrainY(wx, wz);
          float yaw = aBladeMeta.x;
          float edgeShrink = 1.0 - smoothstep(31.0, 38.0, pDist);
          float bh = aBladeMeta.y * (0.25 + 0.75 * vRoadMask) * edgeShrink;
          float lean = aBladeMeta.z;
          float bw = 0.056 + 0.032 * aBladeMeta.w;

          // Multi-frequency wild gust wave
          float waveSin = sin(uTime * 1.45 + wx * 0.34 + wz * 0.24);
          float gust = waveSin * 0.55
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
          if (pDist < 1.35) {
            float push = (1.35 - pDist) / 1.35;
            vec2 pushDir = fromPlayer / pDist;
            wp.xz += pushDir * push * aBladeY * 0.65;
            wp.y -= push * aBladeY * 0.22;
          }

          vec3 worldPos = vec3(wx + wp.x, wy + wp.y - 0.04, wz + wp.z);
          float cloudN = gNoise(vec2(wx, wz) * 0.022 + vec2(uTime * 0.045, uTime * 0.020));
          vCloudShadow = mix(0.74, 1.08, smoothstep(0.32, 0.72, cloudN));
          vWindWave = 0.5 + 0.5 * waveSin;
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
        varying float vCloudShadow;
        varying float vWindWave;
        uniform float uDarkness;
        uniform vec3 uCameraPos;
        void main() {
          if (vRoadMask < 0.06) discard;
          // Deep lush root -> vibrant emerald meadow -> warm sunlit golden tips
          vec3 rootCol = mix(vec3(0.055, 0.088, 0.022), vec3(0.085, 0.130, 0.032), vTone);
          vec3 midCol = mix(vec3(0.18, 0.32, 0.068), vec3(0.28, 0.42, 0.095), vTone);
          vec3 tipCol = mix(vec3(0.46, 0.54, 0.16), vec3(0.62, 0.58, 0.22), vTone);
          vec3 col = vH < 0.55
            ? mix(rootCol, midCol, vH / 0.55)
            : mix(midCol, tipCol, (vH - 0.55) / 0.45);

          float ao = mix(0.24, 1.08, smoothstep(0.0, 0.85, vH));
          vec3 viewDir = normalize(uCameraPos - vWorldPos);
          vec3 sunDir = normalize(vec3(0.24, 0.36, -0.90));
          float backlit = pow(max(0.0, dot(-viewDir, sunDir)), 2.6) * vH * 0.52 * (1.0 - uDarkness) * vCloudShadow;
          float tipSheen = smoothstep(0.65, 1.0, vH) * (0.06 + 0.14 * vWindWave) * (1.0 - uDarkness) * vCloudShadow;

          float dayScale = mix(1.0, 0.14, uDarkness);
          float camDist = length(vWorldPos - uCameraPos);
          float torch = uDarkness * exp(-camDist * 0.10) * 0.65;
          col = (col * ao * vCloudShadow + vec3(0.56, 0.62, 0.18) * backlit + vec3(0.52, 0.56, 0.24) * tipSheen) * (dayScale + torch);
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
    const plainsHouseTiles = [];
    for (const seed of rawHouseSeeds) {
      const hill = findNearbyHillCrest(seed.ox, seed.oz, housePlacements, 16.0);
      const wallCol = new THREE.Color(seed.wall);
      const sideWallCol = new THREE.Color(seed.wallSide);
      const roofCol = new THREE.Color(seed.roof);
      housePlacements.push({
        ox: hill.x,
        oz: hill.z,
        oy: hill.y + 0.08,
        baseRot: seed.rot,
        cosR: Math.cos(-seed.rot),
        sinR: Math.sin(-seed.rot),
        cosInv: Math.cos(seed.rot),
        sinInv: Math.sin(seed.rot),
      });
      // 3x3 far-distance tile grid (252m x 252m) packed into 7 InstancedMeshes (10 total draw calls vs ~7,774!)
      for (let gx = -1; gx <= 1; gx++) {
        for (let gz = -1; gz <= 1; gz++) {
          plainsHouseTiles.push({
            ox: hill.x,
            oz: hill.z,
            oy: hill.y + 0.08,
            rot: seed.rot,
            gx,
            gz,
            wallCol,
            sideWallCol,
            roofCol,
            fence: Boolean(seed.fence),
          });
        }
      }
    }

    const MAX_HOUSES = plainsHouseTiles.length;
    const houseGeos = buildHouseTemplateGeometries();
    const houseInstWall = new THREE.InstancedMesh(houseGeos.wall, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_HOUSES);
    const houseInstSide = new THREE.InstancedMesh(houseGeos.sideWall, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_HOUSES);
    const houseInstRoof = new THREE.InstancedMesh(houseGeos.roof, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_HOUSES);
    const houseInstTrim = new THREE.InstancedMesh(houseGeos.trim, new THREE.MeshLambertMaterial({ color: 0xf4f3ed }), MAX_HOUSES);
    const houseInstGlass = new THREE.InstancedMesh(houseGeos.glass, new THREE.MeshLambertMaterial({ color: 0x0b0e14, emissive: 0x020306 }), MAX_HOUSES);
    const houseInstDoor = new THREE.InstancedMesh(houseGeos.door, new THREE.MeshLambertMaterial({ color: 0xebe8df }), MAX_HOUSES);
    const houseInstFence = new THREE.InstancedMesh(houseGeos.fence, new THREE.MeshLambertMaterial({ color: 0xf4f3ed }), MAX_HOUSES);
    const _initWhite = new THREE.Color(0xffffff);
    houseInstWall.setColorAt(0, _initWhite);
    houseInstSide.setColorAt(0, _initWhite);
    houseInstRoof.setColorAt(0, _initWhite);
    [houseInstWall, houseInstSide, houseInstRoof, houseInstTrim, houseInstGlass, houseInstDoor, houseInstFence].forEach((im) => {
      im.frustumCulled = false;
      im.count = 0;
      brScene.add(im);
    });

    const TOWER_RADIUS = 2.2;
    const waterTowerPos = findNearbyHillCrest(-25, -24, housePlacements, 13.0);
    const plainsTowerTiles = [];
    for (let gx = -1; gx <= 1; gx++) {
      for (let gz = -1; gz <= 1; gz++) {
        plainsTowerTiles.push({
          ox: waterTowerPos.x,
          oz: waterTowerPos.z,
          oy: waterTowerPos.y - 0.1,
          gx,
          gz,
        });
      }
    }
    const towerGeos = buildWaterTowerTemplateGeometries();
    const towerInstSteel = new THREE.InstancedMesh(towerGeos.steel, new THREE.MeshLambertMaterial({ color: 0x747d82 }), plainsTowerTiles.length);
    const towerInstTank = new THREE.InstancedMesh(towerGeos.tank, new THREE.MeshLambertMaterial({ color: 0x9aa4a9 }), plainsTowerTiles.length);
    const towerInstCone = new THREE.InstancedMesh(towerGeos.cone, new THREE.MeshLambertMaterial({ color: 0x6f777c }), plainsTowerTiles.length);
    [towerInstSteel, towerInstTank, towerInstCone].forEach((im) => {
      im.frustumCulled = false;
      im.count = 0;
      brScene.add(im);
    });
    const _instDummy = new THREE.Object3D();
    let plainsVisibleHouses = 0;

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

    // 3D Rigged Wisteria Watcher (Plains)
    const watcherGroup = new THREE.Group();
    watcherGroup.visible = false;
    brScene.add(watcherGroup);

    let wBones = {};
    let bindQ = {};
    let bindDir = {};

    function setupWatcherModel(gltf) {
      const rig = prepareKurizuRig(gltf, 1.98, 0x2d1845, 0.14);
      wBones = rig.bones;
      bindQ = rig.bindQ;
      bindDir = rig.bindDir;
      // Relax arms straight down beside her skirt/legs
      if (bindDir.lArm && bindDir.rArm) {
        rig.holder.updateMatrixWorld(true);
        pointBoneWorld(wBones.lArm, wBones.lFore, bindQ.lArm, bindDir.lArm, new THREE.Vector3(0.14, -1.0, 0.08), 1.0);
        rig.holder.updateMatrixWorld(true);
        pointBoneWorld(wBones.lFore, wBones.lHand, bindQ.lFore, bindDir.lFore, new THREE.Vector3(0.08, -1.0, 0.14), 1.0);
        rig.holder.updateMatrixWorld(true);
        pointBoneWorld(wBones.rArm, wBones.rFore, bindQ.rArm, bindDir.rArm, new THREE.Vector3(-0.14, -1.0, 0.08), 1.0);
        rig.holder.updateMatrixWorld(true);
        pointBoneWorld(wBones.rFore, wBones.rHand, bindQ.rFore, bindDir.rFore, new THREE.Vector3(-0.08, -1.0, 0.14), 1.0);
        rig.holder.updateMatrixWorld(true);
      }
      watcherGroup.add(rig.holder);
      watcherLoaded = true;
      watcherGroup.visible = watcherVisible && active && currentRealm === 'plains';
    }

    function loadKurizuGlbInto(onOk) {
      if (typeof THREE.GLTFLoader !== 'function') return;
      const loader = new THREE.GLTFLoader();
      const loadGlbFallback = () => {
        try {
          loader.load('../game/rigged-modelkurizu.glb', onOk, undefined, () => {});
        } catch {}
      };
      if (global.PLAYER_MODEL_BASE64) {
        try {
          const ab = base64ToArrayBuffer(global.PLAYER_MODEL_BASE64);
          loader.parse(ab, '', onOk, loadGlbFallback);
        } catch {
          loadGlbFallback();
        }
      } else {
        loadGlbFallback();
      }
    }
    loadKurizuGlbInto(setupWatcherModel);

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

    /* ---------------- LEVEL 0 · THE LOBBY (Deep Dark Halls, Smooth Rare Lights, Flashlight Stealth & Fast Chaser) ---------------- */
    const L0_TILE = 48.0;
    const L0_H = 4.5;
    const L0_PLAYER_R = 0.45;
    const l0FogColor = new THREE.Color(0x030201);
    const l0FogDensity = 0.036;

    const l0Scene = new THREE.Scene();
    l0Scene.background = l0FogColor.clone();
    l0Scene.fog = new THREE.FogExp2(l0FogColor.getHex(), l0FogDensity);

    const l0Ambient = new THREE.AmbientLight(0x1e1a0e, 0.20);
    const l0Hemi = new THREE.HemisphereLight(0x282210, 0x090704, 0.16);
    const l0CamLight = new THREE.PointLight(0xffeec2, 0.18, 8.5, 1.65);
    const l0FlashTarget = new THREE.Object3D();
    const l0FlashSpot = new THREE.SpotLight(0xd8ffea, 0, 42, Math.PI / 5.0, 0.55, 1.25);
    l0FlashSpot.target = l0FlashTarget;
    l0Scene.add(l0Ambient, l0Hemi, l0CamLight, l0FlashSpot, l0FlashTarget);

    const GLSL_L0_COMMON = `
      float l0Hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float l0Noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(l0Hash(i), l0Hash(i + vec2(1.0, 0.0)), u.x),
          mix(l0Hash(i + vec2(0.0, 1.0)), l0Hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      // Smooth 3x3 neighborhood radial ceiling light pools (~16% of panels shine, ZERO boxed grid cutoffs!)
      float l0PanelLight(vec2 xz, float time, float danger) {
        vec2 baseCell = floor(xz / 4.8);
        float total = 0.0;
        for (int ox = -1; ox <= 1; ox++) {
          for (int oz = -1; oz <= 1; oz++) {
            vec2 cell = baseCell + vec2(float(ox), float(oz));
            float r = l0Hash(cell);
            if (r < 0.84) continue;
            float flick = r > 0.94 ? (0.62 + 0.38 * sin(time * 24.0 + r * 60.0) * sin(time * 9.0 + r * 17.0)) : 1.0;
            if (danger > 0.05) {
              float panicFlick = 0.35 + 0.65 * sin(time * 38.0 + r * 95.0);
              flick = mix(flick, panicFlick, danger * 0.85);
            }
            vec2 center = (cell + 0.5) * 4.8;
            vec2 diff = (xz - center) / 4.8;
            float d2 = dot(diff, diff);
            float pool = exp(-d2 * 2.65) * smoothstep(2.05, 0.30, d2);
            total += pool * flick;
          }
        }
        return min(total, 1.35);
      }
      float l0FlashCone(vec3 worldPos, vec3 camPos, vec3 camDir, float on) {
        if (on < 0.01) return 0.0;
        vec3 toFrag = worldPos - camPos;
        float dist = length(toFrag);
        vec3 dir = toFrag / max(0.001, dist);
        float c = dot(dir, normalize(camDir));
        float hotspot = smoothstep(0.915, 0.985, c);
        float core = smoothstep(0.84, 0.955, c) * 0.78;
        float spill = smoothstep(0.73, 0.90, c) * 0.28;
        float beam = max(max(hotspot, core), spill) * exp(-dist * 0.044);
        return beam * on;
      }
    `;

    // Far-distance 260x260 damp yellow carpet shader floor (centered on camera)
    const l0FloorGeo = new THREE.PlaneGeometry(260, 260, 1, 1);
    l0FloorGeo.rotateX(-Math.PI * 0.5);
    const l0FloorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenterX: { value: 0 },
        uCenterZ: { value: 0 },
        uDanger: { value: 0 },
        uFlashOn: { value: 1 },
        uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
        uFogColor: { value: l0FogColor.clone() },
        uFogDensity: { value: l0FogDensity },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: `
        uniform float uCenterX;
        uniform float uCenterZ;
        varying vec3 vWorld;
        void main() {
          vec3 wp = vec3(position.x + uCenterX, 0.0, position.z + uCenterZ);
          vWorld = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform float uTime;
        uniform float uDanger;
        uniform float uFlashOn;
        uniform vec3 uFlashDir;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uCameraPos;
        ${GLSL_L0_COMMON}
        void main() {
          float weave = l0Noise(vWorld.xz * 24.0) * 0.65 + l0Noise(vWorld.xz * 6.5) * 0.35;
          float dampPatch = l0Noise(vWorld.xz * 0.22);
          float seam = max(
            1.0 - smoothstep(0.0, 0.03, abs(fract(vWorld.x / 2.4) - 0.5)),
            1.0 - smoothstep(0.0, 0.03, abs(fract(vWorld.z / 2.4) - 0.5))
          );
          vec3 dryCarpet = mix(vec3(0.46, 0.40, 0.14), vec3(0.58, 0.51, 0.19), weave);
          vec3 dampCarpet = vec3(0.32, 0.27, 0.09);
          vec3 col = mix(dryCarpet, dampCarpet, smoothstep(0.55, 0.85, dampPatch) * 0.55);
          col *= (1.0 - seam * 0.12);

          float overhead = l0PanelLight(vWorld.xz, uTime, uDanger);
          float flash = l0FlashCone(vWorld, uCameraPos, uFlashDir, uFlashOn);
          vec3 lightMul = vec3(0.075 + 0.90 * overhead) + vec3(1.52, 2.02, 1.62) * flash;
          col *= lightMul;
          col = mix(col, col * vec3(1.22, 0.58, 0.58), uDanger * 0.42);

          float dist = length(vWorld - uCameraPos);
          float fogFactor = 1.0 - exp(-(uFogDensity * dist) * (uFogDensity * dist));
          float edgeFog = smoothstep(34.0, 48.0, dist);
          col = mix(col, uFogColor, clamp(max(fogFactor * (1.0 - flash * 0.55), edgeFog), 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const l0FloorMesh = new THREE.Mesh(l0FloorGeo, l0FloorMat);
    l0FloorMesh.frustumCulled = false;
    l0Scene.add(l0FloorMesh);

    // Far-distance 260x260 taller 4.5m acoustic drop ceiling with rare shining fluorescent panels
    const l0CeilGeo = new THREE.PlaneGeometry(260, 260, 1, 1);
    l0CeilGeo.rotateX(Math.PI * 0.5);
    const l0CeilMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenterX: { value: 0 },
        uCenterZ: { value: 0 },
        uDanger: { value: 0 },
        uFlashOn: { value: 1 },
        uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
        uFogColor: { value: l0FogColor.clone() },
        uFogDensity: { value: l0FogDensity },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: `
        uniform float uCenterX;
        uniform float uCenterZ;
        varying vec3 vWorld;
        void main() {
          vec3 wp = vec3(position.x + uCenterX, ${L0_H.toFixed(2)}, position.z + uCenterZ);
          vWorld = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform float uTime;
        uniform float uDanger;
        uniform float uFlashOn;
        uniform vec3 uFlashDir;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uCameraPos;
        ${GLSL_L0_COMMON}
        void main() {
          vec2 tileUv = fract(vWorld.xz / 1.2);
          float gridLine = step(tileUv.x, 0.045) + step(0.955, tileUv.x) + step(tileUv.y, 0.045) + step(0.955, tileUv.y);
          float grain = l0Noise(vWorld.xz * 18.0);
          vec3 tileCol = mix(vec3(0.45, 0.41, 0.21), vec3(0.56, 0.51, 0.27), grain);
          tileCol = mix(tileCol, vec3(0.24, 0.21, 0.11), clamp(gridLine, 0.0, 1.0) * 0.72);

          vec2 cell = floor(vWorld.xz / 4.8);
          vec2 cLocal = fract(vWorld.xz / 4.8) - 0.5;
          float r = l0Hash(cell);
          float lit = step(0.84, r);
          float dead = 1.0 - lit;
          float flick = (r > 0.94 || uDanger > 0.08)
            ? mix(1.0, 0.44 + 0.56 * sin(uTime * 34.0 + r * 80.0), max(step(0.94, r) * 0.4, uDanger * 0.85))
            : 1.0;

          float inPanel = step(abs(cLocal.x), 0.145) * step(abs(cLocal.y), 0.095);
          float frame = step(abs(cLocal.x), 0.165) * step(abs(cLocal.y), 0.115) * (1.0 - inPanel);
          float louvre = 0.88 + 0.12 * sin(cLocal.x * 160.0);
          float smoothGlow = l0PanelLight(vWorld.xz, uTime, uDanger);
          float flash = l0FlashCone(vWorld, uCameraPos, uFlashDir, uFlashOn);

          float tileLight = 0.070 + 0.80 * smoothGlow + flash * 1.45;
          vec3 col = tileCol * tileLight;
          col = mix(col, vec3(0.10, 0.09, 0.05) * (0.18 + smoothGlow * 0.8 + flash * 1.2), frame);
          vec3 tubeActive = mix(vec3(1.0, 0.96, 0.82), vec3(1.0, 0.48, 0.52), uDanger * 0.45) * louvre;
          vec3 deadTube = vec3(0.05, 0.045, 0.03) * (0.25 + flash * 1.4);
          vec3 tubeCol = mix(tubeActive * flick, deadTube, dead);
          col = mix(col, tubeCol, inPanel);

          float dist = length(vWorld - uCameraPos);
          float fogFactor = 1.0 - exp(-(uFogDensity * dist) * (uFogDensity * dist));
          float edgeFog = smoothstep(34.0, 48.0, dist);
          float keepLit = clamp(inPanel * lit * 0.78 + flash * 0.50, 0.0, 0.85) * (1.0 - edgeFog);
          col = mix(col, uFogColor, clamp(max(fogFactor * (1.0 - keepLit), edgeFog), 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const l0CeilMesh = new THREE.Mesh(l0CeilGeo, l0CeilMat);
    l0CeilMesh.frustumCulled = false;
    l0Scene.add(l0CeilMesh);

    // Mono-yellow patterned wallpaper shader with dark base + rare lights + flashlight beam
    const l0WallMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDanger: { value: 0 },
        uFlashOn: { value: 1 },
        uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
        uFogColor: { value: l0FogColor.clone() },
        uFogDensity: { value: l0FogDensity },
        uCameraPos: { value: new THREE.Vector3() },
      },
      vertexShader: `
        varying vec3 vWorld;
        varying vec3 vNorm;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vNorm = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        varying vec3 vNorm;
        uniform float uTime;
        uniform float uDanger;
        uniform float uFlashOn;
        uniform vec3 uFlashDir;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec3 uCameraPos;
        ${GLSL_L0_COMMON}
        void main() {
          float horiz = abs(vNorm.x) > abs(vNorm.z) ? vWorld.z : vWorld.x;
          float y = vWorld.y;

          float stripe = 0.5 + 0.5 * sin(horiz * 18.0);
          float motifX = abs(fract(horiz * 1.9) - 0.5) * 2.0;
          float motifY = abs(fract(y * 1.45) - 0.5) * 2.0;
          float diamond = smoothstep(0.55, 0.25, abs(motifX + motifY - 0.95));
          float dirt = l0Noise(vec2(horiz * 0.8, y * 0.8));

          vec3 baseWall = mix(vec3(0.60, 0.54, 0.22), vec3(0.70, 0.64, 0.27), stripe * 0.45 + diamond * 0.38);
          baseWall = mix(baseWall, vec3(0.46, 0.41, 0.16), smoothstep(0.55, 0.9, dirt) * 0.35);

          float dampBottom = exp(-y * 2.1) * 0.22;
          baseWall *= (1.0 - dampBottom);
          float isBaseboard = 1.0 - smoothstep(0.15, 0.18, y);
          float isTopTrim = smoothstep(4.32, 4.35, y);
          vec3 col = mix(baseWall, vec3(0.78, 0.75, 0.58), max(isBaseboard, isTopTrim * 0.65));

          float overhead = l0PanelLight(vWorld.xz, uTime, uDanger);
          float flash = l0FlashCone(vWorld, uCameraPos, uFlashDir, uFlashOn);
          float dirShade = 0.76 + 0.24 * abs(vNorm.z);
          float heightGrad = 0.52 + 0.48 * smoothstep(0.0, 4.3, y);
          col *= (vec3(0.075 + 0.86 * overhead) + vec3(1.54, 2.04, 1.62) * flash) * dirShade * heightGrad;
          col = mix(col, col * vec3(1.18, 0.58, 0.60), uDanger * 0.42);

          float dist = length(vWorld - uCameraPos);
          float fogFactor = 1.0 - exp(-(uFogDensity * dist) * (uFogDensity * dist));
          float edgeFog = smoothstep(34.0, 48.0, dist);
          col = mix(col, uFogColor, clamp(max(fogFactor * (1.0 - flash * 0.55), edgeFog), 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    // Connected semi-maze Level 0 architecture (thicker 0.96m walls + boxy pillars + 4.5m ceiling + wide doorways)
    const l0RawBlocks = [
      // Left front L-wall + transverse hall partition (creates back wall with doorways on left & right)
      { ox: -6.2,  oz: -11.5, w: 0.96, d: 13.0, h: L0_H },
      { ox: -10.8, oz: -5.0,  w: 9.2,  d: 0.96, h: L0_H },
      { ox: -1.8,  oz: -18.0, w: 9.6,  d: 0.96, h: L0_H },

      // Right boxy room corner mass & connected T-junction partition
      { ox: 6.8,   oz: -8.5,  w: 3.4,  d: 4.8,  h: L0_H },
      { ox: 13.5,  oz: -13.5, w: 0.96, d: 14.0, h: L0_H },
      { ox: 18.2,  oz: -6.5,  w: 9.6,  d: 0.96, h: L0_H },

      // Outer left wing & far connector
      { ox: -15.5, oz: -13.5, w: 0.96, d: 12.0, h: L0_H },
      { ox: -19.5, oz: -19.5, w: 8.8,  d: 0.96, h: L0_H },

      // Rear-left & rear-right connected maze corners (with open loops around spawn)
      { ox: -7.5,  oz: 7.5,   w: 0.96, d: 11.0, h: L0_H },
      { ox: -12.5, oz: 13.0,  w: 10.8, d: 0.96, h: L0_H },
      { ox: 8.2,   oz: 7.0,   w: 4.2,  d: 3.6,  h: L0_H },
      { ox: 15.8,  oz: 11.5,  w: 0.96, d: 13.0, h: L0_H },
      { ox: -2.0,  oz: 19.5,  w: 11.5, d: 0.96, h: L0_H },

      // Thick structural square pillars framing corridors
      { ox: -4.2,  oz: 1.8,   w: 1.5,  d: 1.5,  h: L0_H },
      { ox: 4.6,   oz: 0.8,   w: 1.5,  d: 1.5,  h: L0_H },
      { ox: 11.0,  oz: 18.0,  w: 1.6,  d: 1.6,  h: L0_H },
    ];

    // Collision boxes metadata for Level 0 tile
    const l0Walls = l0RawBlocks.map((b) => ({
      ox: b.ox,
      oz: b.oz,
      hw: b.w * 0.5 + L0_PLAYER_R,
      hd: b.d * 0.5 + L0_PLAYER_R,
      geo: new THREE.BoxGeometry(b.w, b.h, b.d),
      h: b.h,
    }));

    // Procedural eerie wall writings + arrows + rare "kurizu was here" scrawl
    function createWallWritingTexture(kind) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 512, 256);

      if (kind === 'welcome') {
        // Splatters + dripping dark red/charcoal WELCOME (inspired by reference image 2)
        g.fillStyle = 'rgba(72, 10, 12, 0.72)';
        for (let i = 0; i < 24; i++) {
          g.beginPath();
          g.arc(95 + (Math.random() - 0.5) * 90, 175 + (Math.random() - 0.5) * 65, 3 + Math.random() * 11, 0, Math.PI * 2);
          g.fill();
        }
        g.save();
        g.translate(256, 125);
        g.rotate(-0.04);
        g.fillStyle = 'rgba(64, 14, 14, 0.86)';
        g.font = 'bold 74px "Comic Sans MS", "Trebuchet MS", sans-serif';
        g.textAlign = 'center';
        g.fillText('WELCOME', 0, 0);
        // Drips
        g.fillRect(-130, 4, 5, 42);
        g.fillRect(-18, 6, 4, 34);
        g.fillRect(102, 2, 6, 48);
        g.fillStyle = 'rgba(28, 22, 12, 0.72)';
        g.font = 'bold 20px monospace';
        g.fillText('WELCOME', -125, -62);
        g.fillText('welcome', 135, 34);
        g.restore();
      } else if (kind === 'dont_turn') {
        g.save();
        g.translate(256, 118);
        g.rotate(0.03);
        g.fillStyle = 'rgba(28, 22, 14, 0.82)';
        g.font = 'bold 38px monospace';
        g.textAlign = 'center';
        g.fillText("DON'T LOOK BACK", 0, 0);
        g.font = 'bold 22px monospace';
        g.fillText('she hears footsteps', 0, 42);
        g.restore();
      } else if (kind === 'keep_running') {
        g.save();
        g.translate(256, 115);
        g.rotate(-0.05);
        g.fillStyle = 'rgba(54, 14, 16, 0.82)';
        g.font = 'bold 42px monospace';
        g.textAlign = 'center';
        g.fillText('KEEP RUNNING', 0, 0);
        g.strokeStyle = 'rgba(28, 22, 14, 0.72)';
        g.lineWidth = 4;
        for (let k = -90; k <= 90; k += 18) {
          g.beginPath(); g.moveTo(k, 28); g.lineTo(k + 3, 62); g.stroke();
        }
        g.restore();
      } else if (kind === 'kurizu_rare') {
        g.save();
        g.translate(256, 122);
        g.rotate(-0.03);
        g.fillStyle = 'rgba(86, 26, 116, 0.88)';
        g.font = 'bold 40px "Courier New", monospace';
        g.textAlign = 'center';
        g.fillText('kurizu was here', 0, 0);
        g.fillStyle = 'rgba(34, 18, 46, 0.8)';
        g.font = 'bold 26px monospace';
        g.fillText(':3  (=^･ω･^=)', 0, 44);
        g.restore();
      } else {
        g.strokeStyle = 'rgba(28, 25, 14, 0.78)';
        g.lineWidth = 14;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(90, 130);
        g.lineTo(400, 124);
        g.moveTo(325, 65);
        g.lineTo(410, 124);
        g.lineTo(325, 185);
        g.stroke();
      }

      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      return tex;
    }

    const decalMats = {
      welcome: new THREE.MeshBasicMaterial({ map: createWallWritingTexture('welcome'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      dont_turn: new THREE.MeshBasicMaterial({ map: createWallWritingTexture('dont_turn'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      keep_running: new THREE.MeshBasicMaterial({ map: createWallWritingTexture('keep_running'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      arrow: new THREE.MeshBasicMaterial({ map: createWallWritingTexture('arrow'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      kurizu_rare: new THREE.MeshBasicMaterial({ map: createWallWritingTexture('kurizu_rare'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    };

    const l0DecalSpecs = [
      // Prominent "WELCOME" writing right on the transverse wall facing spawn down the corridor
      { ox: -1.6,  oy: 2.05, oz: -17.49, ry: 0,               w: 4.4, h: 2.1, kind: 'welcome',      rare: false },
      { ox: 5.07,  oy: 1.95, oz: -8.3,   ry: -Math.PI * 0.5,  w: 2.0, h: 1.0, kind: 'arrow',        rare: false },
      { ox: 12.99, oy: 2.05, oz: -11.5,  ry: -Math.PI * 0.5,  w: 3.6, h: 1.7, kind: 'keep_running', rare: false },
      { ox: -6.99, oy: 2.05, oz: 6.5,    ry: Math.PI * 0.5,   w: 3.6, h: 1.7, kind: 'dont_turn',    rare: false },
      // Rare "kurizu was here" scrawls (appear probabilistically ~22% per wrapped tile)
      { ox: -5.69, oy: 2.0,  oz: -9.5,   ry: Math.PI * 0.5,   w: 3.4, h: 1.6, kind: 'kurizu_rare',  rare: true },
      { ox: -1.8,  oy: 2.0,  oz: -18.51, ry: Math.PI,         w: 3.4, h: 1.6, kind: 'kurizu_rare',  rare: true },
      { ox: -2.0,  oy: 2.0,  oz: 18.99,  ry: Math.PI,         w: 3.4, h: 1.6, kind: 'kurizu_rare',  rare: true },
    ];

    // Build 3x3 continuous tile grid (144m x 144m rendered around player — zero wall pop-in while walking/running!)
    const l0DecalGeos = l0DecalSpecs.map((d) => new THREE.PlaneGeometry(d.w, d.h));
    const l0TileGroups = [];
    for (let gx = -1; gx <= 1; gx++) {
      for (let gz = -1; gz <= 1; gz++) {
        const group = new THREE.Group();
        l0Walls.forEach((w) => {
          const wallMesh = new THREE.Mesh(w.geo, l0WallMat);
          wallMesh.position.set(w.ox, w.h * 0.5, w.oz);
          group.add(wallMesh);
        });
        const tileDecals = l0DecalSpecs.map((d, idx) => {
          const m = new THREE.Mesh(l0DecalGeos[idx], decalMats[d.kind]);
          m.position.set(d.ox, d.oy, d.oz);
          m.rotation.y = d.ry;
          group.add(m);
          return { mesh: m, rare: d.rare, idx };
        });
        l0Scene.add(group);
        l0TileGroups.push({ group, gx, gz, decals: tileDecals });
      }
    }

    function tileHash(tx, tz) {
      const s = Math.sin(tx * 127.1 + tz * 311.7) * 43758.5453;
      return s - Math.floor(s);
    }

    function resolveLevel0Collisions(wx, wz) {
      let rx = wx;
      let rz = wz;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < l0Walls.length; i++) {
          const w = l0Walls[i];
          const cx = Math.round((rx - w.ox) / L0_TILE) * L0_TILE + w.ox;
          const cz = Math.round((rz - w.oz) / L0_TILE) * L0_TILE + w.oz;
          const dx = rx - cx;
          const dz = rz - cz;
          const penX = w.hw - Math.abs(dx);
          const penZ = w.hd - Math.abs(dz);
          if (penX > 0 && penZ > 0) {
            if (penX < penZ) {
              rx = cx + (dx >= 0 ? w.hw : -w.hw);
            } else {
              rz = cz + (dz >= 0 ? w.hd : -w.hd);
            }
          }
        }
      }
      return { x: rx, z: rz };
    }

    function isInsideAnyL0Wall(wx, wz, extraPad) {
      const pad = extraPad || 0;
      for (let i = 0; i < l0Walls.length; i++) {
        const w = l0Walls[i];
        const cx = Math.round((wx - w.ox) / L0_TILE) * L0_TILE + w.ox;
        const cz = Math.round((wz - w.oz) / L0_TILE) * L0_TILE + w.oz;
        if (Math.abs(wx - cx) < (w.hw - 0.12 + pad) && Math.abs(wz - cz) < (w.hd - 0.12 + pad)) {
          return true;
        }
      }
      return false;
    }

    function getNearestL0Wall(wx, wz) {
      let best = null;
      let bestDist = Infinity;
      for (let i = 0; i < l0Walls.length; i++) {
        const w = l0Walls[i];
        const cx = Math.round((wx - w.ox) / L0_TILE) * L0_TILE + w.ox;
        const cz = Math.round((wz - w.oz) / L0_TILE) * L0_TILE + w.oz;
        const d = Math.hypot(cx - wx, cz - wz);
        if (d < bestDist) {
          bestDist = d;
          best = { x: cx, z: cz, hw: w.hw, hd: w.hd, dist: d };
        }
      }
      return best;
    }

    let l0RareVisibleCount = 0;
    const L0_PC_ALCOVES = [
      [-11.2, -16.5],
      [18.5, -16.5],
      [10.5, 13.5],
    ];
    let l0PcBaseX = L0_PC_ALCOVES[0][0];
    let l0PcBaseZ = L0_PC_ALCOVES[0][1];
    const l0PcPos = new THREE.Vector3(l0PcBaseX, 0, l0PcBaseZ);
    let l0PcDist = 99;
    let l0PcRestarting = false;
    let l0PcRestartTime = 0;
    let l0PcRestarted = false;
    let l0PcResetFired = false;

    const l0PcGroup = new THREE.Group();
    const l0PcDeskMat = new THREE.MeshLambertMaterial({ color: 0x3b3022 });
    const l0PcCaseMat = new THREE.MeshLambertMaterial({ color: 0xc2b89f });
    const l0PcDarkMat = new THREE.MeshLambertMaterial({ color: 0x1e2226 });
    const l0PcScreenCanvas = document.createElement('canvas');
    l0PcScreenCanvas.width = 256;
    l0PcScreenCanvas.height = 192;
    const l0PcScreenCtx = l0PcScreenCanvas.getContext('2d');
    l0PcScreenCtx.fillStyle = '#041f1c';
    l0PcScreenCtx.fillRect(0, 0, 256, 192);
    l0PcScreenCtx.fillStyle = '#34d399';
    l0PcScreenCtx.font = 'bold 18px monospace';
    l0PcScreenCtx.fillText('KURIZU_OS v0.94', 18, 42);
    l0PcScreenCtx.fillStyle = '#a7f3d0';
    l0PcScreenCtx.font = '14px monospace';
    l0PcScreenCtx.fillText('ERR: BACKROOMS_LOCK', 18, 76);
    l0PcScreenCtx.fillText('> RESET SITE SYSTEM', 18, 112);
    l0PcScreenCtx.fillStyle = '#22d3ee';
    l0PcScreenCtx.font = 'bold 16px monospace';
    l0PcScreenCtx.fillText('[E] RESTART PC_', 18, 152);
    l0PcScreenCtx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let sy = 0; sy < 192; sy += 4) l0PcScreenCtx.fillRect(0, sy, 256, 2);
    const l0PcScreenTex = new THREE.CanvasTexture(l0PcScreenCanvas);
    l0PcScreenTex.encoding = THREE.sRGBEncoding;
    const l0PcScreenMat = new THREE.MeshBasicMaterial({ map: l0PcScreenTex });

    const pcDeskTop = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 0.78), l0PcDeskMat);
    pcDeskTop.position.set(0, 0.78, 0);
    l0PcGroup.add(pcDeskTop);
    [[-0.63, -0.32], [0.63, -0.32], [-0.63, 0.32], [0.63, 0.32]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.08), l0PcDeskMat);
      leg.position.set(lx, 0.39, lz);
      l0PcGroup.add(leg);
    });
    const pcMonitorBody = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.42), l0PcCaseMat);
    pcMonitorBody.position.set(-0.08, 1.07, -0.06);
    l0PcGroup.add(pcMonitorBody);
    const pcMonitorBezel = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.37, 0.03), l0PcDarkMat);
    pcMonitorBezel.position.set(-0.08, 1.08, 0.148);
    l0PcGroup.add(pcMonitorBezel);
    const pcScreenPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.31), l0PcScreenMat);
    pcScreenPlane.position.set(-0.08, 1.08, 0.166);
    l0PcGroup.add(pcScreenPlane);
    const pcTower = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.50, 0.44), l0PcCaseMat);
    pcTower.position.set(0.42, 1.07, -0.02);
    l0PcGroup.add(pcTower);
    const pcPowerLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x34d399 })
    );
    pcPowerLed.position.set(0.42, 1.18, 0.205);
    l0PcGroup.add(pcPowerLed);
    const pcKeyboard = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.03, 0.16), l0PcCaseMat);
    pcKeyboard.position.set(-0.08, 0.835, 0.24);
    l0PcGroup.add(pcKeyboard);
    const pcMouse = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.11), l0PcCaseMat);
    pcMouse.position.set(0.24, 0.835, 0.25);
    l0PcGroup.add(pcMouse);

    const l0PcGlow = new THREE.PointLight(0x38f8c4, 1.85, 13.0, 1.45);
    l0PcGlow.position.set(-0.05, 1.42, 0.45);
    l0PcGroup.add(l0PcGlow);
    l0PcGroup.position.copy(l0PcPos);
    l0Scene.add(l0PcGroup);

    function wrapLevel0Entities() {
      const baseTX = Math.round(pos.x / L0_TILE);
      const baseTZ = Math.round(pos.z / L0_TILE);
      let rareCount = 0;
      for (let i = 0; i < l0TileGroups.length; i++) {
        const tg = l0TileGroups[i];
        const tx = baseTX + tg.gx;
        const tz = baseTZ + tg.gz;
        tg.group.position.set(tx * L0_TILE, 0, tz * L0_TILE);
        for (let k = 0; k < tg.decals.length; k++) {
          const d = tg.decals[k];
          if (d.rare) {
            const show = tileHash(tx + d.idx * 3, tz - d.idx * 5) > 0.78;
            d.mesh.visible = show;
            if (show) rareCount++;
          }
        }
      }
      l0RareVisibleCount = rareCount;

      const pcWX = Math.round((pos.x - l0PcBaseX) / L0_TILE) * L0_TILE + l0PcBaseX;
      const pcWZ = Math.round((pos.z - l0PcBaseZ) / L0_TILE) * L0_TILE + l0PcBaseZ;
      l0PcPos.set(pcWX, 0, pcWZ);
      l0PcGroup.position.copy(l0PcPos);
      l0PcDist = Math.hypot(pcWX - pos.x, pcWZ - pos.z);
    }

    // 3D Rigged Scary Wisteria Chaser (Level 0) + Proximity Horror + Phase-4 Grab Jumpscare
    let l0ChaserLoaded = false;
    let l0PetVisible = true;
    let l0PetDisappearCount = 0;
    let l0Danger = 0;
    let l0Caught = false;
    let l0GrabTime = 0;
    let l0GrabClosedFired = false;
    let l0HeartbeatTimer = 0;
    let l0RunPhase = 0;
    const l0PetPos = new THREE.Vector3(3.2, 0, -30.5);

    const l0ChaserGroup = new THREE.Group();
    const l0ChaserShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.58, 20),
      new THREE.MeshBasicMaterial({ color: 0x16030b, transparent: true, opacity: 0.55 })
    );
    l0ChaserShadow.rotation.x = -Math.PI * 0.5;
    l0ChaserShadow.position.y = 0.015;
    l0ChaserGroup.add(l0ChaserShadow);

    const l0ChaserGlow = new THREE.PointLight(0xd8b4fe, 0.9, 10.5, 1.45);
    l0ChaserGlow.position.set(0, 1.5, 0.45);
    l0ChaserGroup.add(l0ChaserGlow);
    l0Scene.add(l0ChaserGroup);

    let cBones = {};
    let cBindQ = {};
    let cBindDir = {};
    let cHolder = null;
    let cMaterials = [];
    let l0ChaserMixer = null;
    let l0SprintAction = null;
    let l0SprintClipName = null;

    function setupL0ChaserModel(gltf) {
      const rig = prepareKurizuRig(gltf, 2.14, 0x3b124d, 0.24);
      cBones = rig.bones;
      cBindQ = rig.bindQ;
      cBindDir = rig.bindDir;
      cHolder = rig.holder;
      cMaterials = rig.materials;

      if (typeof THREE.AnimationMixer === 'function') {
        l0ChaserMixer = new THREE.AnimationMixer(rig.raw);
        const sprintClip = THREE.AnimationClip.findByName(gltf.animations || [], 'Sprint')
          || (gltf.animations && gltf.animations[0])
          || null;
        if (sprintClip) {
          l0SprintClipName = sprintClip.name;
          l0SprintAction = l0ChaserMixer.clipAction(sprintClip);
          l0SprintAction.setLoop(THREE.LoopRepeat, Infinity);
          l0SprintAction.play();
        }
      }

      l0ChaserGroup.add(rig.holder);
      l0ChaserLoaded = true;
      l0ChaserGroup.visible = active && currentRealm === 'level0';
    }
    loadKurizuGlbInto(setupL0ChaserModel);

    function placeL0PetFarAway(wx, wz, minDist, maxDist) {
      const candidates = [
        [2.8, -31.0],
        [-11.5, -27.5],
        [17.5, -24.0],
        [-20.0, 26.0],
        [20.5, 25.0],
      ];
      for (const [cx, cz] of candidates) {
        const tx = wx + cx;
        const tz = wz + cz;
        if (!isInsideAnyL0Wall(tx, tz, 0.75)) {
          l0PetPos.set(tx, 0, tz);
          l0ChaserGroup.position.copy(l0PetPos);
          return;
        }
      }
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const dist = minDist + Math.random() * (maxDist - minDist);
        const tx = wx - Math.sin(ang) * dist;
        const tz = wz - Math.cos(ang) * dist;
        if (!isInsideAnyL0Wall(tx, tz, 0.75)) {
          l0PetPos.set(tx, 0, tz);
          l0ChaserGroup.position.copy(l0PetPos);
          return;
        }
      }
      l0PetPos.set(wx + 2.6, 0, wz - minDist);
      l0ChaserGroup.position.copy(l0PetPos);
    }

    function playHeartbeatThump(danger) {
      const ctx = getAudio();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        [0, 0.16].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(idx === 0 ? 58 : 48, now + offset);
          osc.frequency.exponentialRampToValueAtTime(28, now + offset + 0.14);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.01, now + offset);
          g.gain.linearRampToValueAtTime(0.11 * danger + 0.03, now + offset + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.16);
        });
      } catch {}
    }

    function playJumpscareSfx() {
      const ctx = getAudio();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const len = Math.floor(ctx.sampleRate * 0.55);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.25));
        }
        const nSrc = ctx.createBufferSource();
        nSrc.buffer = buf;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.28, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
        nSrc.connect(ng);
        ng.connect(ctx.destination);
        nSrc.start(now);

        [220, 311, 587].forEach((f) => {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, now);
          osc.frequency.linearRampToValueAtTime(f * 0.6, now + 0.5);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.09, now);
          g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.52);
        });
      } catch {}
    }

    // Grid BFS pathfinder over 1.5m cells so Wisteria cleanly rounds thick maze walls & doorways
    const BFS_N = 36;
    const BFS_STEP = 1.5;
    const bfsVisited = new Uint8Array(BFS_N * BFS_N);
    const bfsNextX = new Float32Array(BFS_N * BFS_N);
    const bfsNextZ = new Float32Array(BFS_N * BFS_N);
    const bfsQueue = new Int16Array(BFS_N * BFS_N);
    let bfsTargetX = 0;
    let bfsTargetZ = 0;
    let bfsTimer = 0;

    // Level 0 Camera Viewfinder, Blind-Wander Ambush, Stare Jumpscare & PC Objective State
    let l0CameraOn = false;
    let l0CamOffWanderTimer = 0;
    let l0NextAmbushAt = 3.6;
    let l0AmbushBoost = 0;
    let l0StareTimer = 0;
    const L0_STARE_LIMIT = 2.2;
    let l0TeleportCount = 0;
    let l0CaughtReason = null;
    let l0KnowsPlayer = true;
    const l0LastKnownPos = new THREE.Vector3(0, 0, 0);
    const l0PatrolTarget = new THREE.Vector3(0, 0, -14);
    const _flashDirVec = new THREE.Vector3();

    function playFlashlightClickSfx() {
      const ctx = getAudio();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1600, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.035);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.045);
      } catch {}
    }

    function playPcRestartSfx() {
      const ctx = getAudio();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        [523.25, 659.25, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.001, now + idx * 0.08);
          g.gain.linearRampToValueAtTime(0.14, now + idx * 0.08 + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.24);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.26);
        });
      } catch {}
    }

    function updateCamViewfinderUI() {
      const showCam = active && currentRealm === 'level0' && l0CameraOn && !l0Caught && !l0PcRestarting;
      if (camViewEl) {
        camViewEl.hidden = !showCam;
        camViewEl.classList.toggle('is-active', showCam);
        const stareRatio = Math.max(0, Math.min(1, l0StareTimer / L0_STARE_LIMIT));
        camViewEl.classList.toggle('is-warn', showCam && stareRatio > 0.08);
        if (stareFillEl) stareFillEl.style.width = `${Math.round(stareRatio * 100)}%`;
      }
    }

    function setL0Camera(nextOn, silent) {
      l0CameraOn = !!nextOn;
      if (!l0CameraOn) l0StareTimer = Math.max(0, l0StareTimer * 0.25);
      if (flashBtn) {
        flashBtn.classList.toggle('is-active', l0CameraOn);
        flashBtn.setAttribute('aria-pressed', String(l0CameraOn));
        flashBtn.textContent = l0CameraOn ? 'CAMERA: ON [F]' : 'CAMERA: OFF [F]';
      }
      updateCamViewfinderUI();
      if (!silent) playFlashlightClickSfx();
    }

    function hasL0LineOfSight(ax, az, bx, bz) {
      const dist = Math.hypot(bx - ax, bz - az);
      if (dist <= 0.6) return true;
      const steps = Math.max(2, Math.ceil(dist / 0.45));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (isInsideAnyL0Wall(ax + (bx - ax) * t, az + (bz - az) * t, -0.08)) {
          return false;
        }
      }
      return true;
    }

    function triggerL0Jumpscare(reason) {
      if (l0Caught || l0PcRestarting) return;
      l0Caught = true;
      l0CaughtReason = reason || 'caught';
      l0GrabTime = 0;
      l0GrabClosedFired = false;
      l0Danger = 1.0;
      l0StareTimer = 0;
      l0ChaserGroup.visible = l0ChaserLoaded;
      if (hudEl) hudEl.classList.remove('is-active');
      if (pcBtn) pcBtn.hidden = true;
      updateCamViewfinderUI();
      if (dangerEl) dangerEl.style.setProperty('--danger', '1');
      if (jumpscareSpanEl) {
        jumpscareSpanEl.textContent = l0CaughtReason === 'stare' ? 'YOU STARED TOO LONG' : 'SHE GOT YOU';
      }
      if (jumpscareEl) {
        jumpscareEl.classList.remove('is-reboot');
        jumpscareEl.hidden = false;
      }
      playJumpscareSfx();
      stopAmbience();
      if (l0SprintAction) l0SprintAction.stop();
      restoreChaserBindPose();
      animateL0ChaserGrab(0);
    }

    function triggerL0PcRestart() {
      if (!active || currentRealm !== 'level0' || l0Caught || l0PcRestarting) return;
      l0PcRestarting = true;
      l0PcRestartTime = 0;
      l0PcRestarted = true;
      l0PcResetFired = false;
      l0StareTimer = 0;
      vhsGlitchSpike = 2.8;
      if (hudEl) hudEl.classList.remove('is-active');
      if (pcBtn) pcBtn.hidden = true;
      updateCamViewfinderUI();
      if (jumpscareSpanEl) jumpscareSpanEl.textContent = 'SYSTEM REBOOTING...';
      if (jumpscareEl) {
        jumpscareEl.classList.add('is-reboot');
        jumpscareEl.hidden = false;
      }
      playPcRestartSfx();
      stopAmbience();
    }

    function animateL0PcRestart(dt) {
      l0PcRestartTime += dt;
      vhsGlitchSpike = 2.4 + Math.sin(l0PcRestartTime * 36.0) * 0.4;
      const toPcYaw = Math.atan2(pos.x - l0PcPos.x, pos.z - l0PcPos.z);
      brCamera.position.set(
        pos.x + (Math.random() - 0.5) * 0.05,
        1.52 + (Math.random() - 0.5) * 0.04,
        pos.z + (Math.random() - 0.5) * 0.05
      );
      brCamera.rotation.order = 'YXZ';
      brCamera.rotation.y = toPcYaw + (Math.random() - 0.5) * 0.04;
      brCamera.rotation.x = -0.14 + (Math.random() - 0.5) * 0.04;
      brCamera.rotation.z = Math.sin(l0PcRestartTime * 28.0) * 0.05;
      const nextFov = Math.max(44, 62 - l0PcRestartTime * 22);
      if (Math.abs(brCamera.fov - nextFov) > 0.2) {
        brCamera.fov = nextFov;
        brCamera.updateProjectionMatrix();
      }
      l0PcGlow.intensity = 3.2 + Math.sin(l0PcRestartTime * 35.0) * 1.4;
      if (l0PcRestartTime >= 0.85 && !l0PcResetFired) {
        l0PcResetFired = true;
        onPcRestartReset();
      }
    }

    function pickL0PatrolPoint() {
      for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 16 + Math.random() * 18;
        const tx = l0PetPos.x + Math.cos(ang) * dist;
        const tz = l0PetPos.z + Math.sin(ang) * dist;
        if (!isInsideAnyL0Wall(tx, tz, 0.8)) {
          l0PatrolTarget.set(tx, 0, tz);
          return;
        }
      }
      l0PatrolTarget.set(l0LastKnownPos.x, 0, l0LastKnownPos.z);
    }

    function computeChaseWaypoint(goalX, goalZ) {
      const gx = typeof goalX === 'number' ? goalX : pos.x;
      const gz = typeof goalZ === 'number' ? goalZ : pos.z;
      const originX = Math.round(gx / BFS_STEP) * BFS_STEP - (BFS_N * 0.5) * BFS_STEP;
      const originZ = Math.round(gz / BFS_STEP) * BFS_STEP - (BFS_N * 0.5) * BFS_STEP;
      const pIdxX = Math.max(1, Math.min(BFS_N - 2, Math.round((gx - originX) / BFS_STEP)));
      const pIdxZ = Math.max(1, Math.min(BFS_N - 2, Math.round((gz - originZ) / BFS_STEP)));
      const wIdxX = Math.max(0, Math.min(BFS_N - 1, Math.round((l0PetPos.x - originX) / BFS_STEP)));
      const wIdxZ = Math.max(0, Math.min(BFS_N - 1, Math.round((l0PetPos.z - originZ) / BFS_STEP)));

      bfsVisited.fill(0);
      let head = 0;
      let tail = 0;
      const startCell = pIdxZ * BFS_N + pIdxX;
      bfsVisited[startCell] = 1;
      bfsNextX[startCell] = gx;
      bfsNextZ[startCell] = gz;
      bfsQueue[tail++] = startCell;

      const targetCell = wIdxZ * BFS_N + wIdxX;
      const dirs = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1];
      while (head < tail) {
        const cur = bfsQueue[head++];
        if (cur === targetCell) {
          bfsTargetX = bfsNextX[cur];
          bfsTargetZ = bfsNextZ[cur];
          return true;
        }
        const cx = cur % BFS_N;
        const cz = (cur / BFS_N) | 0;
        const cwx = originX + cx * BFS_STEP;
        const cwz = originZ + cz * BFS_STEP;
        for (let k = 0; k < 16; k += 2) {
          const nx = cx + dirs[k];
          const nz = cz + dirs[k + 1];
          if (nx < 0 || nx >= BFS_N || nz < 0 || nz >= BFS_N) continue;
          const nCell = nz * BFS_N + nx;
          if (bfsVisited[nCell]) continue;
          const nwx = originX + nx * BFS_STEP;
          const nwz = originZ + nz * BFS_STEP;
          if (isInsideAnyL0Wall(nwx, nwz, 0.12)) {
            bfsVisited[nCell] = 2;
            continue;
          }
          // Disallow diagonal corner-cutting across walls
          if (dirs[k] !== 0 && dirs[k + 1] !== 0) {
            if (
              isInsideAnyL0Wall(originX + (cx + dirs[k]) * BFS_STEP, cwz, 0.05) ||
              isInsideAnyL0Wall(cwx, originZ + (cz + dirs[k + 1]) * BFS_STEP, 0.05)
            ) {
              continue;
            }
          }
          bfsVisited[nCell] = 1;
          bfsNextX[nCell] = cwx;
          bfsNextZ[nCell] = cwz;
          bfsQueue[tail++] = nCell;
        }
      }
      return false;
    }

    function animateL0ChaserRun(dt, speedScale) {
      if (!l0ChaserLoaded) return;

      if (l0ChaserMixer && l0SprintAction) {
        l0SprintAction.enabled = true;
        l0SprintAction.setEffectiveWeight(1);
        l0SprintAction.setEffectiveTimeScale(l0KnowsPlayer ? (1.58 + speedScale * 0.65) : 0.78);
        l0ChaserMixer.update(Math.min(dt, 0.25));
        if (cBones.hips && cBindQ.hipsPos) {
          cBones.hips.position.x = cBindQ.hipsPos.x;
          cBones.hips.position.z = cBindQ.hipsPos.z;
        }
        // Subtle horror head/neck twitch layered lightly over Sprint clip when near
        if (l0Danger > 0.25) {
          if (cBones.neck) {
            cBones.neck.quaternion.multiply(
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.sin(brTime * 34.0) * 0.22 * l0Danger))
            );
          }
          if (cBones.head) {
            cBones.head.quaternion.multiply(
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.cos(brTime * 41.0) * 0.18 * l0Danger, 0))
            );
          }
        }
      } else {
        l0RunPhase += dt * (9.5 + speedScale * 4.5);
        const s = Math.sin(l0RunPhase);
        if (cBones.lUpLeg && cBindQ.lUpLegLocal) {
          cBones.lUpLeg.quaternion.copy(cBindQ.lUpLegLocal).multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(s * 0.72, 0, 0))
          );
        }
        if (cBones.rUpLeg && cBindQ.rUpLegLocal) {
          cBones.rUpLeg.quaternion.copy(cBindQ.rUpLegLocal).multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(-s * 0.72, 0, 0))
          );
        }
      }

      // Subtle purple glint when seen through camera -> intense crimson emissive ramp when closing in or stared at
      const glareBoost = Math.max(l0Danger, Math.min(1, l0StareTimer / L0_STARE_LIMIT));
      for (let i = 0; i < cMaterials.length; i++) {
        cMaterials[i].emissive.setRGB(0.14 + glareBoost * 0.58, 0.04, 0.18 * (1.0 - glareBoost * 0.45));
      }
      l0ChaserGlow.color.setHex(glareBoost > 0.32 ? 0xff2a6d : 0x6ee7b7);
      l0ChaserGlow.intensity = l0CameraOn ? (0.45 + glareBoost * 2.4) : 0;
    }

    function restoreChaserBindPose() {
      ['hips', 'spine', 'spine1', 'neck', 'head', 'lUpLeg', 'lLeg', 'rUpLeg', 'rLeg'].forEach((k) => {
        if (cBones[k] && cBindQ[`${k}Local`]) cBones[k].quaternion.copy(cBindQ[`${k}Local`]);
      });
      if (cBones.hips && cBindQ.hipsPos) cBones.hips.position.copy(cBindQ.hipsPos);
    }

    function animateL0ChaserGrab(dt) {
      l0GrabTime += dt;
      // Place 3D Wisteria ~1.25m in front of camera so her full face, cat ears & reaching hands frame the grab!
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const grabDist = Math.max(1.22, 1.48 - Math.min(1, l0GrabTime * 2.5) * 0.26);
      l0PetPos.set(pos.x + fx * grabDist, 0, pos.z + fz * grabDist);
      l0ChaserGroup.position.copy(l0PetPos);
      l0ChaserGroup.rotation.y = yaw; // local +Z faces toward camera!
      l0ChaserGroup.visible = l0ChaserLoaded;

      // Violent camera lock + FOV lunge + Z roll pointing straight at her face (y ~ 1.85m)
      brCamera.position.set(
        pos.x + (Math.random() - 0.5) * 0.09,
        1.72 + (Math.random() - 0.5) * 0.06,
        pos.z + (Math.random() - 0.5) * 0.09
      );
      brCamera.rotation.order = 'YXZ';
      brCamera.rotation.y = yaw + Math.sin(l0GrabTime * 46.0) * 0.05;
      brCamera.rotation.x = 0.06 + Math.sin(l0GrabTime * 38.0) * 0.05;
      brCamera.rotation.z = Math.sin(l0GrabTime * 31.0) * 0.14;
      if (Math.abs(brCamera.fov - 52) > 0.2) {
        brCamera.fov = 52;
        brCamera.updateProjectionMatrix();
      }

      if (l0ChaserLoaded) {
        restoreChaserBindPose();
        if (cBones.spine && cBindQ.spineLocal) {
          cBones.spine.quaternion.copy(cBindQ.spineLocal).multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, 0, 0))
          );
        }
        if (cBones.neck && cBindQ.neckLocal) {
          cBones.neck.quaternion.copy(cBindQ.neckLocal).multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, Math.sin(l0GrabTime * 52.0) * 0.22, Math.cos(l0GrabTime * 44.0) * 0.34))
          );
        }
        if (cBones.head && cBindQ.headLocal) {
          cBones.head.quaternion.copy(cBindQ.headLocal).multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, Math.sin(l0GrabTime * 60.0) * 0.32, 0))
          );
        }
        if (cBones.lUpLeg && cBindQ.lUpLegLocal) cBones.lUpLeg.quaternion.copy(cBindQ.lUpLegLocal);
        if (cBones.rUpLeg && cBindQ.rUpLegLocal) cBones.rUpLeg.quaternion.copy(cBindQ.rUpLegLocal);
        if (cBones.lLeg && cBindQ.lLegLocal) cBones.lLeg.quaternion.copy(cBindQ.lLegLocal);
        if (cBones.rLeg && cBindQ.rLegLocal) cBones.rLeg.quaternion.copy(cBindQ.rLegLocal);

        const q = l0ChaserGroup.quaternion;
        const lunge = 0.22 + Math.sin(l0GrabTime * 32.0) * 0.14;
        l0ChaserGroup.updateMatrixWorld(true);
        pointBoneWorld(cBones.lArm, cBones.lFore, cBindQ.lArm, cBindDir.lArm,
          new THREE.Vector3(-0.22, 0.26, 0.96).applyQuaternion(q), 1.0, q);
        l0ChaserGroup.updateMatrixWorld(true);
        pointBoneWorld(cBones.lFore, cBones.lHand, cBindQ.lFore, cBindDir.lFore,
          new THREE.Vector3(0.18, lunge, 0.96).applyQuaternion(q), 1.0, q);
        l0ChaserGroup.updateMatrixWorld(true);
        pointBoneWorld(cBones.rArm, cBones.rFore, cBindQ.rArm, cBindDir.rArm,
          new THREE.Vector3(0.22, 0.26, 0.96).applyQuaternion(q), 1.0, q);
        l0ChaserGroup.updateMatrixWorld(true);
        pointBoneWorld(cBones.rFore, cBones.rHand, cBindQ.rFore, cBindDir.rFore,
          new THREE.Vector3(-0.18, lunge, 0.96).applyQuaternion(q), 1.0, q);
      }

      l0ChaserGlow.color.setHex(0xff2a6d);
      l0ChaserGlow.position.set(0, 1.55, 0.5);
      l0ChaserGlow.intensity = 3.2 + Math.sin(l0GrabTime * 48.0) * 1.4;
      for (let i = 0; i < cMaterials.length; i++) {
        cMaterials[i].emissive.setRGB(0.68, 0.10, 0.24);
      }

      if (l0GrabTime >= 1.15 && !l0GrabClosedFired) {
        l0GrabClosedFired = true;
        onCaughtCloseSite();
      }
    }

    function stepLevel0WisteriaChase(dt, isMoving, isSprinting) {
      if (l0Caught || l0PcRestarting) return;
      const toPlayerX = pos.x - l0PetPos.x;
      const toPlayerZ = pos.z - l0PetPos.z;
      const dist = Math.hypot(toPlayerX, toPlayerZ);

      l0Danger = Math.max(0, Math.min(1, 1.0 - (dist - 2.2) / 22.0));

      if (dist < 2.15) {
        triggerL0Jumpscare('caught');
        return;
      }

      // 1. Visibility: completely invisible in Level 0 unless player looks through their handheld camera
      const canSeeWisteria = l0CameraOn && l0ChaserLoaded;

      // 2. Blind-wander ambush: walking/running around without checking the camera causes her to teleport ahead
      if (!l0CameraOn && isMoving) {
        l0CamOffWanderTimer += dt * (isSprinting ? 1.85 : 1.0);
        if (l0CamOffWanderTimer >= l0NextAmbushAt) {
          l0CamOffWanderTimer = 0;
          l0NextAmbushAt = 3.2 + Math.random() * 2.0;
          const distChoices = [5.8, 4.8, 7.0, 3.9];
          const angChoices = [0, 0.25, -0.25, 0.52, -0.52];
          let placed = false;
          for (let dIdx = 0; dIdx < distChoices.length && !placed; dIdx++) {
            for (let aIdx = 0; aIdx < angChoices.length; aIdx++) {
              const ang = yaw + angChoices[aIdx];
              const tx = pos.x - Math.sin(ang) * distChoices[dIdx];
              const tz = pos.z - Math.cos(ang) * distChoices[dIdx];
              if (!isInsideAnyL0Wall(tx, tz, 0.55) && hasL0LineOfSight(pos.x, pos.z, tx, tz)) {
                l0PetPos.set(tx, 0, tz);
                l0ChaserGroup.position.copy(l0PetPos);
                placed = true;
                break;
              }
            }
          }
          if (placed) {
            l0TeleportCount++;
            l0AmbushBoost = 2.6;
            vhsGlitchSpike = Math.max(vhsGlitchSpike, 0.85);
            playStaticVanishSfx();
            bfsTimer = 0;
          }
        }
      } else if (l0CameraOn) {
        l0CamOffWanderTimer = Math.max(0, l0CamOffWanderTimer - dt * 1.4);
      }

      if (l0AmbushBoost > 0) {
        l0AmbushBoost = Math.max(0, l0AmbushBoost - dt);
      }

      // 3. Staring too long through camera: builds dread, shakes viewfinder, then teleports directly to jumpscare
      const curDist = Math.hypot(pos.x - l0PetPos.x, pos.z - l0PetPos.z);
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const toWX = (l0PetPos.x - pos.x) / Math.max(0.001, curDist);
      const toWZ = (l0PetPos.z - pos.z) / Math.max(0.001, curDist);
      const viewDot = fwdX * toWX + fwdZ * toWZ;
      const isStaring = Boolean(
        l0CameraOn &&
        curDist < 24.0 &&
        viewDot > 0.82 &&
        hasL0LineOfSight(pos.x, pos.z, l0PetPos.x, l0PetPos.z)
      );

      if (isStaring) {
        l0StareTimer += dt;
        const stareRatio = Math.min(1, l0StareTimer / L0_STARE_LIMIT);
        vhsGlitchSpike = Math.max(vhsGlitchSpike, stareRatio * 1.15);
        brCamera.position.x += (Math.random() - 0.5) * 0.045 * stareRatio;
        brCamera.position.y += (Math.random() - 0.5) * 0.03 * stareRatio;
        if (l0StareTimer >= L0_STARE_LIMIT) {
          l0TeleportCount++;
          updateCamViewfinderUI();
          triggerL0Jumpscare('stare');
          return;
        }
      } else {
        l0StareTimer = Math.max(0, l0StareTimer - dt * 1.35);
      }
      updateCamViewfinderUI();

      // 4. Stalking & pathing toward player
      l0KnowsPlayer = true;
      l0LastKnownPos.copy(pos);
      const goalDistToTarget = Math.hypot(pos.x - l0PetPos.x, pos.z - l0PetPos.z);

      bfsTimer -= dt;
      if (bfsTimer <= 0 || Math.hypot(bfsTargetX - l0PetPos.x, bfsTargetZ - l0PetPos.z) < 0.75) {
        bfsTimer = 0.18;
        if (!computeChaseWaypoint(pos.x, pos.z)) {
          bfsTargetX = pos.x;
          bfsTargetZ = pos.z;
        }
      }

      const goalX = goalDistToTarget < 5.0 ? pos.x : bfsTargetX;
      const goalZ = goalDistToTarget < 5.0 ? pos.z : bfsTargetZ;
      const gx = goalX - l0PetPos.x;
      const gz = goalZ - l0PetPos.z;
      const gDist = Math.hypot(gx, gz);
      const dirX = gx / Math.max(0.001, gDist);
      const dirZ = gz / Math.max(0.001, gDist);

      const stareRatio = Math.min(1, l0StareTimer / L0_STARE_LIMIT);
      let chaseSpeed = l0AmbushBoost > 0
        ? 6.8
        : (l0CameraOn ? (3.6 + l0Danger * 1.6) : (2.4 + l0Danger * 1.1));
      if (isStaring) {
        // Freeze & twitch toward the camera lens while stare meter builds toward teleport-jumpscare
        chaseSpeed = 0.0;
      }
      const stepDist = chaseSpeed * Math.min(dt, 0.25);

      const oldX = l0PetPos.x;
      const oldZ = l0PetPos.z;
      let next = resolveLevel0Collisions(oldX + dirX * stepDist, oldZ + dirZ * stepDist);
      const moved = Math.hypot(next.x - oldX, next.z - oldZ);
      if (moved < stepDist * 0.25) {
        computeChaseWaypoint(pos.x, pos.z);
        const fx = bfsTargetX - oldX;
        const fz = bfsTargetZ - oldZ;
        const fl = Math.hypot(fx, fz) || 1;
        next = resolveLevel0Collisions(oldX + (fx / fl) * stepDist, oldZ + (fz / fl) * stepDist);
      }

      l0PetPos.x = next.x;
      l0PetPos.z = next.z;
      l0ChaserGroup.visible = canSeeWisteria;
      l0ChaserGroup.position.copy(l0PetPos);
      if (isStaring && stareRatio > 0.2) {
        l0ChaserGroup.rotation.y = Math.atan2(pos.x - l0PetPos.x, pos.z - l0PetPos.z);
      } else {
        const faceDx = next.x - oldX;
        const faceDz = next.z - oldZ;
        if (Math.hypot(faceDx, faceDz) > 0.002) {
          l0ChaserGroup.rotation.y = Math.atan2(faceDx, faceDz);
        } else {
          l0ChaserGroup.rotation.y = Math.atan2(pos.x - l0PetPos.x, pos.z - l0PetPos.z);
        }
      }
      animateL0ChaserRun(dt, l0Danger);

      const effDanger = Math.max(l0Danger, stareRatio * 0.9);
      // Proximity danger vignette, micro-tremor & heartbeat (wide FOV handled by chest body-cam rig)
      if (dangerEl) {
        dangerEl.style.setProperty('--danger', (effDanger * 0.92).toFixed(3));
      }
      if (effDanger > 0.14) {
        brCamera.position.x += (Math.random() - 0.5) * 0.055 * effDanger;
        brCamera.position.y += (Math.random() - 0.5) * 0.035 * effDanger;
        l0HeartbeatTimer -= dt;
        if (l0HeartbeatTimer <= 0) {
          playHeartbeatThump(effDanger);
          l0HeartbeatTimer = Math.max(0.32, 0.98 - effDanger * 0.62);
        }
      }
    }

    // Subdued wind ambience (Plains) / real MP3 fluorescent hum (Level 0) + vanish SFX
    let ambienceCleanup = null;
    let l0HumActive = false;
    let l0HumBuffer = null;
    let l0HumFetchStarted = false;
    let l0HumFallbackEl = null;
    const L0_HUM_URL = '../assets/music/level0-fluorescent-hum.mp3';

    function prefetchLevel0Hum(ctx) {
      if (l0HumFetchStarted || l0HumBuffer || !ctx || typeof fetch !== 'function') return;
      l0HumFetchStarted = true;
      fetch(L0_HUM_URL)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((ab) => (ab ? ctx.decodeAudioData(ab) : null))
        .then((decoded) => {
          if (!decoded) return;
          l0HumBuffer = decoded;
          // Seamlessly upgrade fallback element to gapless WebAudio loop if still in Level 0
          if (active && currentRealm === 'level0' && !l0Caught && !l0PcRestarting && ambienceCleanup && !ambienceCleanup.hasRealBuffer) {
            startAmbience('level0');
          }
        })
        .catch(() => {});
    }

    function stopHumFallbackElement() {
      if (!l0HumFallbackEl) return;
      try {
        l0HumFallbackEl.pause();
        l0HumFallbackEl.currentTime = 0;
      } catch {}
    }

    function startAmbience(realm) {
      stopAmbienceImmediate();
      const ctx = getAudio();
      if (realm === 'level0') {
        if (ctx) prefetchLevel0Hum(ctx);
        if (ctx && l0HumBuffer) {
          try {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            const master = ctx.createGain();
            master.gain.value = 0.001;
            master.connect(ctx.destination);
            const src = ctx.createBufferSource();
            src.buffer = l0HumBuffer;
            src.loop = true;
            src.connect(master);
            src.start(0);
            master.gain.exponentialRampToValueAtTime(0.42, ctx.currentTime + 0.35);
            ambienceCleanup = { master, nodesToStop: [src], hasRealBuffer: true };
            l0HumActive = true;
            return;
          } catch {}
        }
        try {
          if (!l0HumFallbackEl) {
            l0HumFallbackEl = new Audio(L0_HUM_URL);
            l0HumFallbackEl.loop = true;
            l0HumFallbackEl.preload = 'auto';
          }
          l0HumFallbackEl.volume = 0.36;
          l0HumFallbackEl.currentTime = 0;
          const p = l0HumFallbackEl.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
          ambienceCleanup = { nodesToStop: [], hasRealBuffer: false, usesHtmlAudio: true };
          l0HumActive = true;
          return;
        } catch {}
        return;
      }
      if (!ctx) return;
      try {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const nodesToStop = [];
        const master = ctx.createGain();
        master.gain.value = 0.001;
        master.connect(ctx.destination);

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
        src.connect(lp);
        lp.connect(master);
        src.start();
        nodesToStop.push(src);
        master.gain.exponentialRampToValueAtTime(0.085, ctx.currentTime + 1.1);
        ambienceCleanup = { master, nodesToStop };
      } catch {}
    }

    function stopAmbienceImmediate() {
      l0HumActive = false;
      stopHumFallbackElement();
      if (!ambienceCleanup) return;
      const cur = ambienceCleanup;
      ambienceCleanup = null;
      cur.nodesToStop.forEach((n) => { try { n.stop(); } catch {} });
      if (cur.master) {
        try { cur.master.disconnect(); } catch {}
      }
    }

    function stopAmbience() {
      l0HumActive = false;
      stopHumFallbackElement();
      if (!ambienceCleanup) return;
      const cur = ambienceCleanup;
      ambienceCleanup = null;
      const ctx = getAudio();
      try {
        if (ctx && cur.master) {
          cur.master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
          setTimeout(() => {
            cur.nodesToStop.forEach((n) => { try { n.stop(); } catch {} });
            try { cur.master.disconnect(); } catch {}
          }, 240);
        } else {
          cur.nodesToStop.forEach((n) => { try { n.stop(); } catch {} });
        }
      } catch {
        cur.nodesToStop.forEach((n) => { try { n.stop(); } catch {} });
      }
    }

    function playStaticVanishSfx() {
      vhsGlitchSpike = 1.0;
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

    function playCeilingBreachSfx() {
      const ctx = getAudio();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const len = Math.floor(ctx.sampleRate * 0.16);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.045));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 620;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        src.connect(bp).connect(g).connect(ctx.destination);
        src.start(now);
      } catch {}
    }

    function playFallImpactSfx(realm) {
      const ctx = getAudio();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(98, now);
        osc.frequency.exponentialRampToValueAtTime(26, now + 0.28);
        og.gain.setValueAtTime(0.32, now);
        og.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
        osc.connect(og).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.32);

        const len = Math.floor(ctx.sampleRate * 0.22);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = realm === 'level0' ? 520 : 780;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.22, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        src.connect(lp).connect(ng).connect(ctx.destination);
        src.start(now);
      } catch {}
    }

    function wrapWorldEntities() {
      const baseTX = Math.round(pos.x / TILE);
      const baseTZ = Math.round(pos.z / TILE);
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      let visCount = 0;
      let fenceCount = 0;

      for (let i = 0; i < plainsHouseTiles.length; i++) {
        const item = plainsHouseTiles[i];
        const hx = (baseTX + item.gx) * TILE + item.ox;
        const hz = (baseTZ + item.gz) * TILE + item.oz;
        const dx = hx - pos.x;
        const dz = hz - pos.z;
        const dist = Math.hypot(dx, dz);
        // Keep close houses always rendered; derender anything behind or outside the wide fisheye view
        if (!(dist < 12.0 || (dist < 145.0 && (dx * fx + dz * fz) / (dist || 1) > 0.08))) continue;

        _instDummy.position.set(hx, item.oy, hz);
        _instDummy.rotation.set(0, item.rot, 0);
        _instDummy.scale.set(1, 1, 1);
        _instDummy.updateMatrix();

        houseInstWall.setMatrixAt(visCount, _instDummy.matrix);
        houseInstSide.setMatrixAt(visCount, _instDummy.matrix);
        houseInstRoof.setMatrixAt(visCount, _instDummy.matrix);
        houseInstTrim.setMatrixAt(visCount, _instDummy.matrix);
        houseInstGlass.setMatrixAt(visCount, _instDummy.matrix);
        houseInstDoor.setMatrixAt(visCount, _instDummy.matrix);
        houseInstWall.setColorAt(visCount, item.wallCol);
        houseInstSide.setColorAt(visCount, item.sideWallCol);
        houseInstRoof.setColorAt(visCount, item.roofCol);
        visCount++;

        if (item.fence) {
          houseInstFence.setMatrixAt(fenceCount, _instDummy.matrix);
          fenceCount++;
        }
      }
      plainsVisibleHouses = visCount;
      houseInstWall.count = visCount;
      houseInstSide.count = visCount;
      houseInstRoof.count = visCount;
      houseInstTrim.count = visCount;
      houseInstGlass.count = visCount;
      houseInstDoor.count = visCount;
      houseInstFence.count = fenceCount;
      houseInstWall.instanceMatrix.needsUpdate = true;
      houseInstSide.instanceMatrix.needsUpdate = true;
      houseInstRoof.instanceMatrix.needsUpdate = true;
      houseInstTrim.instanceMatrix.needsUpdate = true;
      houseInstGlass.instanceMatrix.needsUpdate = true;
      houseInstDoor.instanceMatrix.needsUpdate = true;
      houseInstFence.instanceMatrix.needsUpdate = true;
      if (houseInstWall.instanceColor) houseInstWall.instanceColor.needsUpdate = true;
      if (houseInstSide.instanceColor) houseInstSide.instanceColor.needsUpdate = true;
      if (houseInstRoof.instanceColor) houseInstRoof.instanceColor.needsUpdate = true;

      let towerCount = 0;
      for (let i = 0; i < plainsTowerTiles.length; i++) {
        const item = plainsTowerTiles[i];
        const tx = (baseTX + item.gx) * TILE + item.ox;
        const tz = (baseTZ + item.gz) * TILE + item.oz;
        const dx = tx - pos.x;
        const dz = tz - pos.z;
        const dist = Math.hypot(dx, dz);
        if (!(dist < 12.0 || (dist < 145.0 && (dx * fx + dz * fz) / (dist || 1) > 0.08))) continue;
        _instDummy.position.set(tx, item.oy, tz);
        _instDummy.rotation.set(0, 0, 0);
        _instDummy.scale.set(1, 1, 1);
        _instDummy.updateMatrix();
        towerInstSteel.setMatrixAt(towerCount, _instDummy.matrix);
        towerInstTank.setMatrixAt(towerCount, _instDummy.matrix);
        towerInstCone.setMatrixAt(towerCount, _instDummy.matrix);
        towerCount++;
      }
      towerInstSteel.count = towerCount;
      towerInstTank.count = towerCount;
      towerInstCone.count = towerCount;
      towerInstSteel.instanceMatrix.needsUpdate = true;
      towerInstTank.instanceMatrix.needsUpdate = true;
      towerInstCone.instanceMatrix.needsUpdate = true;
    }

    function syncAtmosphereLighting() {
      const d1 = Math.min(1, darkness * 2.0);
      const d2 = Math.max(0, darkness * 2.0 - 1.0);
      liveFogColor.copy(dayFogColor).lerp(duskFogColor, d1).lerp(nightFogColor, d2);

      brScene.background.copy(liveFogColor);

      ambientLight.intensity = 0.48 - darkness * 0.39;
      hemiLight.intensity = 0.70 - darkness * 0.56;
      sunLight.intensity = 1.08 - darkness * 0.94;
      flashlight.intensity = darkness * 1.45;
      flashlight.position.set(pos.x, pos.y + 0.2, pos.z);

      skyPlainsMat.uniforms.uDarkness.value = darkness;
      skyPlainsMat.uniforms.uFogColor.value.copy(liveFogColor);
      starMat.uniforms.uAlpha.value = Math.max(0, Math.min(1, (darkness - 0.32) / 0.58));
      groundMat.uniforms.uDarkness.value = darkness;
      groundMat.uniforms.uFogColor.value.copy(liveFogColor);
      grassMat.uniforms.uDarkness.value = darkness;
      grassMat.uniforms.uFogColor.value.copy(liveFogColor);
    }

    function syncBodyCamLagImmediate(chestY) {
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      camLagPos.set(pos.x + fwdX * 0.13 + rightX * 0.045, chestY, pos.z + fwdZ * 0.13 + rightZ * 0.045);
      camLagYaw = yaw;
      camLagPitch = pitch;
      camTurnRollCur = 0;
      camLagInit = true;
    }

    function applyChestBodyCam(dt, baseGroundY, moving, sprinting, baseFov) {
      const clampDt = Math.min(Math.max(dt, 0.001), 0.06);
      const fwdX = -Math.sin(yaw);
      const fwdZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);

      const chestBaseY = baseGroundY + 1.44;
      if (!camLagInit) syncBodyCamLagImmediate(chestBaseY);

      camMoveBlend += ((moving ? 1 : 0) - camMoveBlend) * Math.min(1, clampDt * 7.5);
      camSprintBlend += (((moving && sprinting) ? 1 : 0) - camSprintBlend) * Math.min(1, clampDt * 6.5);

      const rec = landRecoverTimer > 0 ? (landRecoverTimer / LAND_RECOVER_DUR) : 0;
      const landCrouch = rec > 0 ? -Math.pow(rec, 1.45) * 0.92 : 0;
      const landRoll = rec > 0 ? Math.pow(rec, 1.35) * 0.34 : 0;
      const landPitch = rec > 0 ? -Math.pow(rec, 1.3) * 0.28 : 0;

      const breatheY = Math.sin(brTime * 1.55) * 0.013;
      const stepBob = Math.abs(Math.sin(bobPhase)) * (0.072 + camSprintBlend * 0.052) * camMoveBlend + breatheY;
      const targetLat = Math.cos(bobPhase) * (0.048 + camSprintBlend * 0.036) * camMoveBlend + Math.sin(brTime * 0.85) * 0.009;
      const targetRoll = Math.cos(bobPhase) * (0.034 + camSprintBlend * 0.032) * camMoveBlend + Math.sin(brTime * 0.78) * 0.007;
      const targetPitchBob = Math.sin(bobPhase * 2.0) * (0.018 + camSprintBlend * 0.016) * camMoveBlend;

      camLatCur += (targetLat - camLatCur) * Math.min(1, clampDt * 12.0);
      camRollCur += (targetRoll - camRollCur) * Math.min(1, clampDt * 12.0);
      camPitchBobCur += (targetPitchBob - camPitchBobCur) * Math.min(1, clampDt * 12.0);

      pos.y = chestBaseY + stepBob + landCrouch;
      const targetCamX = pos.x + fwdX * 0.13 + rightX * (0.045 + camLatCur);
      const targetCamY = pos.y;
      const targetCamZ = pos.z + fwdZ * 0.13 + rightZ * (0.045 + camLatCur);

      // Weighted spring lag on both torso translation and head/chest rotation
      const posK = 1.0 - Math.exp(-clampDt * 10.5);
      const rotK = 1.0 - Math.exp(-clampDt * 12.0);
      camLagPos.x += (targetCamX - camLagPos.x) * posK;
      camLagPos.y += (targetCamY - camLagPos.y) * posK;
      camLagPos.z += (targetCamZ - camLagPos.z) * posK;
      camLagYaw += (yaw - camLagYaw) * rotK;
      camLagPitch += (pitch - camLagPitch) * rotK;

      const yawLagDelta = yaw - camLagYaw;
      const targetTurnRoll = Math.max(-0.085, Math.min(0.085, -yawLagDelta * 0.24));
      camTurnRollCur += (targetTurnRoll - camTurnRollCur) * Math.min(1, clampDt * 10.0);

      const targetFov = baseFov + camSprintBlend * 4.5;
      camFovCur += (targetFov - camFovCur) * Math.min(1, clampDt * 8.0);
      if (Math.abs(brCamera.fov - camFovCur) > 0.05) {
        brCamera.fov = camFovCur;
        brCamera.updateProjectionMatrix();
      }

      brCamera.position.copy(camLagPos);
      brCamera.rotation.order = 'YXZ';
      brCamera.rotation.y = camLagYaw;
      brCamera.rotation.x = Math.max(-1.28, Math.min(1.25, camLagPitch + camPitchBobCur + landPitch));
      brCamera.rotation.z = camRollCur + camTurnRollCur + landRoll;
    }

    function stepSkyFallFrame(dt, baseGroundY) {
      const clampDt = Math.min(Math.max(dt, 0.001), 0.06);
      const landY = baseGroundY + 1.44;
      fallVy -= 24.0 * clampDt;
      pos.y += fallVy * clampDt;
      fallRollPhase += clampDt * 11.0;
      pitch += (-0.12 - pitch) * Math.min(1, clampDt * 2.1);
      vhsGlitchSpike = Math.max(vhsGlitchSpike, 0.48);

      if (currentRealm === 'level0' && !fallPassedCeiling && pos.y <= L0_H) {
        fallPassedCeiling = true;
        vhsGlitchSpike = 1.45;
        playCeilingBreachSfx();
      }

      if (pos.y <= landY) {
        pos.y = landY;
        fallActive = false;
        fallVy = 0;
        landRecoverTimer = LAND_RECOVER_DUR;
        vhsGlitchSpike = 1.85;
        playFallImpactSfx(currentRealm);
      }

      camFovCur += (96 - camFovCur) * Math.min(1, clampDt * 2.5);
      if (Math.abs(brCamera.fov - camFovCur) > 0.05) {
        brCamera.fov = camFovCur;
        brCamera.updateProjectionMatrix();
      }
      const windSway = Math.sin(fallRollPhase) * 0.14;
      syncBodyCamLagImmediate(pos.y);
      brCamera.position.set(pos.x + windSway * 0.18, pos.y, pos.z);
      brCamera.rotation.order = 'YXZ';
      brCamera.rotation.y = yaw;
      brCamera.rotation.x = Math.max(-1.28, Math.min(1.25, pitch));
      brCamera.rotation.z = fallActive ? windSway : 0.34;
    }

    function stepSimulation(dt, directStepX, directStepZ, testOpts) {
      brTime += dt;
      vhsGlitchSpike = Math.max(0, vhsGlitchSpike - dt * 2.8);
      const targetCamView = (currentRealm === 'level0' && l0CameraOn && !l0Caught && !l0PcRestarting) ? 1.0 : 0.0;
      l0CamViewUniform += (targetCamView - l0CamViewUniform) * Math.min(1, dt * 16.0);
      if (vhsStampEl) {
        const totalFrames = Math.max(0, Math.floor(brTime * 30));
        const ff = String(totalFrames % 30).padStart(2, '0');
        const totalSec = Math.floor(totalFrames / 30);
        const ss = String(totalSec % 60).padStart(2, '0');
        const mm = String(Math.floor(totalSec / 60) % 60).padStart(2, '0');
        const hh = String(Math.floor(totalSec / 3600) % 24).padStart(2, '0');
        const key = `${currentRealm}:${hh}:${mm}:${ss}:${ff}`;
        if (key !== lastVhsStampKey) {
          lastVhsStampKey = key;
          const dateLabel = currentRealm === 'level0' ? 'OCT 28 1998' : 'JAN 14 1996';
          vhsStampEl.textContent = `REC · ${dateLabel} · ${hh}:${mm}:${ss}:${ff}`;
        }
      }
      const clampedDt = Math.min(dt, 0.06);

      // Movement (either interactive WASD or scripted test displacement)
      let stepX = 0;
      let stepZ = 0;
      let moving = false;
      let sprinting = false;

      if (typeof directStepX === 'number' || typeof directStepZ === 'number') {
        stepX = directStepX || 0;
        stepZ = directStepZ || 0;
        moving = Math.hypot(stepX, stepZ) > 0.001 || Boolean(testOpts && testOpts.moving);
        sprinting = Boolean(testOpts && testOpts.sprinting);
      } else {
        let fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
        let str = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
        if (Math.hypot(joyX, joyY) > 0.08) {
          fwd += joyY;
          str += joyX;
        }
        if (keys.KeyQ) yaw += clampedDt * 1.85;
        if (keys.KeyE && !(currentRealm === 'level0' && l0PcDist < 3.2)) yaw -= clampedDt * 1.85;
        const mag = Math.hypot(fwd, str);
        if (mag > 0.05) {
          moving = true;
          const joyAutoSprint = Math.hypot(joyX, joyY) > 0.88;
          sprinting = Boolean(keys.ShiftLeft || keys.ShiftRight || mobileSprint || joyAutoSprint);
          const speed = (sprinting ? 10.6 : 6.4) * Math.min(1, mag);
          const fNorm = fwd / mag;
          const sNorm = str / mag;
          const fx = -Math.sin(yaw);
          const fz = -Math.cos(yaw);
          const rx = Math.cos(yaw);
          const rz = -Math.sin(yaw);
          stepX = (fx * fNorm + rx * sNorm) * speed * clampedDt;
          stepZ = (fz * fNorm + rz * sNorm) * speed * clampedDt;
        }
      }

      if (fallActive) {
        stepX = 0;
        stepZ = 0;
        moving = false;
        sprinting = false;
      } else if (landRecoverTimer > 0) {
        landRecoverTimer = Math.max(0, landRecoverTimer - clampedDt);
      }

      const prevX = pos.x;
      const prevZ = pos.z;

      if (currentRealm === 'level0') {
        brCamera.getWorldDirection(_flashDirVec);
        l0FlashSpot.position.set(pos.x, pos.y - 0.12, pos.z);
        l0FlashTarget.position.copy(pos).addScaledVector(_flashDirVec, 12.0);
        l0FlashSpot.intensity = l0CameraOn ? 3.4 : 0.0;
        l0PcGlow.intensity = 1.65 + 0.35 * Math.sin(brTime * 4.2);

        if (l0PcRestarting) {
          animateL0PcRestart(dt);
          l0FloorMat.uniforms.uTime.value = brTime;
          l0FloorMat.uniforms.uDanger.value = 0;
          l0FloorMat.uniforms.uFlashOn.value = 0;
          l0CeilMat.uniforms.uTime.value = brTime;
          l0CeilMat.uniforms.uDanger.value = 0;
          l0CeilMat.uniforms.uFlashOn.value = 0;
          l0WallMat.uniforms.uTime.value = brTime;
          l0WallMat.uniforms.uDanger.value = 0;
          l0WallMat.uniforms.uFlashOn.value = 0;
          return;
        }

        if (l0Caught) {
          animateL0ChaserGrab(dt);
          l0FloorMat.uniforms.uTime.value = brTime;
          l0FloorMat.uniforms.uDanger.value = 1.0;
          l0FloorMat.uniforms.uFlashOn.value = l0CameraOn ? 1.0 : 0.0;
          l0FloorMat.uniforms.uFlashDir.value.copy(_flashDirVec);
          l0CeilMat.uniforms.uTime.value = brTime;
          l0CeilMat.uniforms.uDanger.value = 1.0;
          l0CeilMat.uniforms.uFlashOn.value = l0CameraOn ? 1.0 : 0.0;
          l0CeilMat.uniforms.uFlashDir.value.copy(_flashDirVec);
          l0WallMat.uniforms.uTime.value = brTime;
          l0WallMat.uniforms.uDanger.value = 1.0;
          l0WallMat.uniforms.uFlashOn.value = l0CameraOn ? 1.0 : 0.0;
          l0WallMat.uniforms.uFlashDir.value.copy(_flashDirVec);
          return;
        }
        const resolved = resolveLevel0Collisions(pos.x + stepX, pos.z + stepZ);
        pos.x = resolved.x;
        pos.z = resolved.z;

        const movedDist = Math.hypot(pos.x - prevX, pos.z - prevZ);
        if (moving && movedDist > 0.001) {
          bobPhase += movedDist * 1.65;
        }

        loopDistance += movedDist;
        const curWrap = Math.floor((Math.abs(pos.x) + Math.abs(pos.z)) / L0_TILE);
        if (curWrap > wrapCount) wrapCount = curWrap;

        if (fallActive) {
          stepSkyFallFrame(dt, 0);
        } else {
          const stareRatioCur = Math.min(1, l0StareTimer / L0_STARE_LIMIT);
          const effTension = Math.max(l0Danger, stareRatioCur * 0.9);
          const aimFov = (l0CameraOn ? BODYCAM_IR_FOV : BODYCAM_BASE_FOV) + effTension * 5.0;
          applyChestBodyCam(dt, 0, moving, sprinting, aimFov);
        }
        brCamera.getWorldDirection(_flashDirVec);

        l0CamLight.position.set(pos.x, pos.y + 0.2, pos.z);
        l0FlashSpot.position.set(pos.x, pos.y - 0.12, pos.z);
        l0FlashTarget.position.copy(pos).addScaledVector(_flashDirVec, 12.0);
        l0FlashSpot.intensity = l0CameraOn ? 3.4 : 0.0;

        wrapLevel0Entities();
        if (pcBtn) pcBtn.hidden = !(l0PcDist < 3.2 && !l0Caught && !l0PcRestarting && !fallActive);
        if (!fallActive) {
          stepLevel0WisteriaChase(dt, moving, sprinting);
        } else {
          l0ChaserGroup.visible = false;
        }

        l0FloorMat.uniforms.uTime.value = brTime;
        l0FloorMat.uniforms.uCenterX.value = pos.x;
        l0FloorMat.uniforms.uCenterZ.value = pos.z;
        l0FloorMat.uniforms.uDanger.value = l0Danger;
        l0FloorMat.uniforms.uFlashOn.value = l0CameraOn ? 1.0 : 0.0;
        l0FloorMat.uniforms.uFlashDir.value.copy(_flashDirVec);
        l0FloorMat.uniforms.uCameraPos.value.copy(pos);

        l0CeilMat.uniforms.uTime.value = brTime;
        l0CeilMat.uniforms.uCenterX.value = pos.x;
        l0CeilMat.uniforms.uCenterZ.value = pos.z;
        l0CeilMat.uniforms.uDanger.value = l0Danger;
        l0CeilMat.uniforms.uFlashOn.value = l0CameraOn ? 1.0 : 0.0;
        l0CeilMat.uniforms.uFlashDir.value.copy(_flashDirVec);
        l0CeilMat.uniforms.uCameraPos.value.copy(pos);

        l0WallMat.uniforms.uTime.value = brTime;
        l0WallMat.uniforms.uDanger.value = l0Danger;
        l0WallMat.uniforms.uFlashOn.value = l0CameraOn ? 1.0 : 0.0;
        l0WallMat.uniforms.uFlashDir.value.copy(_flashDirVec);
        l0WallMat.uniforms.uCameraPos.value.copy(pos);
        return;
      }

      const resolved = resolveWorldCollisions(pos.x + stepX, pos.z + stepZ);
      pos.x = resolved.x;
      pos.z = resolved.z;

      const movedDist = Math.hypot(pos.x - prevX, pos.z - prevZ);
      if (moving && movedDist > 0.001) {
        bobPhase += movedDist * 1.65;
      }

      // Accumulate loop distance & detect 84m tile wraps -> progressive darkness
      loopDistance += movedDist;
      const curWrap = Math.floor((Math.abs(pos.x) + Math.abs(pos.z)) / TILE);
      if (curWrap > wrapCount) wrapCount = curWrap;
      darkness = Math.min(1.0, loopDistance / 200.0 + wrapCount * 0.035);

      const groundH = terrainY(pos.x, pos.z);
      if (fallActive) {
        stepSkyFallFrame(dt, groundH);
      } else {
        // Update chest body-cam rig (lag + wide FOV + bounce) + wrapped entities + atmosphere
        applyChestBodyCam(dt, groundH, moving, sprinting, BODYCAM_BASE_FOV);
      }
      skySphere.position.copy(pos);
      starPoints.position.copy(pos);
      starMat.uniforms.uTime.value = brTime;

      wrapWorldEntities();
      syncAtmosphereLighting();

      // Animate 3D Wisteria Watcher (follows you onto nearby misty hills if you walk > 34m away, vanishes on < 11.5m)
      if (watcherVisible) {
        const wDist = Math.hypot(watcherPos.x - pos.x, watcherPos.z - pos.z);
        if (wDist < 11.5) {
          watcherVisible = false;
          watcherGroup.visible = false;
          watcherGlow.intensity = 0;
          watcherDisappearCount++;
          watcherRespawnTimer = 2.6;
          playStaticVanishSfx();
        } else {
          if (wDist > 34.0) {
            placeWatcherOnHill(pos.x, pos.z, 19, 29);
            watcherFollowCount++;
          }
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
          placeWatcherOnHill(pos.x, pos.z, 20, 30);
          watcherVisible = true;
          watcherGroup.visible = watcherLoaded;
        }
      }

      skyPlainsMat.uniforms.uTime.value = brTime;
      groundMat.uniforms.uTime.value = brTime;
      groundMat.uniforms.uCenterX.value = pos.x;
      groundMat.uniforms.uCenterZ.value = pos.z;
      groundMat.uniforms.uCameraPos.value.copy(pos);
      const grassFwdX = -Math.sin(yaw);
      const grassFwdZ = -Math.cos(yaw);
      grassMat.uniforms.uTime.value = brTime;
      grassMat.uniforms.uCenterX.value = pos.x + grassFwdX * 15.0;
      grassMat.uniforms.uCenterZ.value = pos.z + grassFwdZ * 15.0;
      grassMat.uniforms.uCamFwdXZ.value.set(grassFwdX, grassFwdZ);
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
      if (e.code === 'KeyF' && !e.repeat && currentRealm === 'level0' && !l0Caught && !l0PcRestarting) {
        e.preventDefault();
        setL0Camera(!l0CameraOn);
        return;
      }
      if (e.code === 'KeyE' && !e.repeat && currentRealm === 'level0' && !l0Caught && !l0PcRestarting && l0PcDist < 3.2) {
        e.preventDefault();
        triggerL0PcRestart();
        return;
      }
      keys[e.code] = true;
    }

    function onFlashBtnClick(e) {
      if (!active || currentRealm !== 'level0' || l0Caught || l0PcRestarting) return;
      e.preventDefault();
      e.stopPropagation();
      setL0Camera(!l0CameraOn);
    }

    function onPcBtnClick(e) {
      if (!active || currentRealm !== 'level0' || l0Caught || l0PcRestarting) return;
      e.preventDefault();
      e.stopPropagation();
      triggerL0PcRestart();
    }

    function onCanvasRightClick(e) {
      if (!active || currentRealm !== 'level0' || l0Caught || l0PcRestarting) return;
      e.preventDefault();
      setL0Camera(!l0CameraOn);
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
      if (!active || e.pointerType === 'touch') return;
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
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {}
      }
    }

    // Mobile virtual joystick (left thumb)
    function updateJoystickFromPoint(clientX, clientY) {
      if (!joyBase) return;
      const rect = joyBase.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const maxR = Math.max(24, rect.width * 0.36);
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      joyX = dx / maxR;
      joyY = -dy / maxR;
      if (joyKnob) {
        joyKnob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
      }
    }

    function resetJoystick() {
      joyPointerId = null;
      joyX = 0;
      joyY = 0;
      if (joyBase) joyBase.classList.remove('is-dragging');
      if (joyKnob) joyKnob.style.transform = 'translate3d(0, 0, 0)';
    }

    function onJoyPointerDown(e) {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      joyPointerId = e.pointerId;
      if (joyBase) {
        joyBase.classList.add('is-dragging');
        try { joyBase.setPointerCapture(e.pointerId); } catch {}
      }
      updateJoystickFromPoint(e.clientX, e.clientY);
    }

    function onJoyPointerMove(e) {
      if (!active || e.pointerId !== joyPointerId) return;
      e.preventDefault();
      updateJoystickFromPoint(e.clientX, e.clientY);
    }

    function onJoyPointerUp(e) {
      if (e.pointerId !== joyPointerId) return;
      resetJoystick();
    }

    function onSprintClick(e) {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      mobileSprint = !mobileSprint;
      if (sprintBtn) {
        sprintBtn.classList.toggle('is-active', mobileSprint);
        sprintBtn.setAttribute('aria-pressed', String(mobileSprint));
      }
    }

    // Multi-touch look drag on canvas (ignores touches on HUD/joystick)
    let lookTouchId = null;
    let touchPrev = null;
    function onTouchStart(e) {
      if (!active) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.target && t.target.closest && t.target.closest('#backroomsHud')) continue;
        if (lookTouchId === null) {
          lookTouchId = t.identifier;
          touchPrev = { x: t.clientX, y: t.clientY };
          break;
        }
      }
    }
    function onTouchMove(e) {
      if (!active || lookTouchId === null || !touchPrev) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === lookTouchId) {
          e.preventDefault();
          const dx = t.clientX - touchPrev.x;
          const dy = t.clientY - touchPrev.y;
          touchPrev = { x: t.clientX, y: t.clientY };
          yaw -= dx * 0.0048;
          pitch = Math.max(-1.25, Math.min(1.2, pitch - dy * 0.0042));
          break;
        }
      }
    }
    function onTouchEnd(e) {
      if (lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId) {
          lookTouchId = null;
          touchPrev = null;
          break;
        }
      }
    }

    function attachListeners() {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      document.addEventListener('pointerlockchange', onPointerLockChange);
      canvas.addEventListener('click', onCanvasClick);
      canvas.addEventListener('contextmenu', onCanvasRightClick);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('touchstart', onTouchStart, { passive: true });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: true });
      canvas.addEventListener('touchcancel', onTouchEnd, { passive: true });
      if (joyBase) {
        joyBase.addEventListener('pointerdown', onJoyPointerDown);
        joyBase.addEventListener('pointermove', onJoyPointerMove);
        joyBase.addEventListener('pointerup', onJoyPointerUp);
        joyBase.addEventListener('pointercancel', onJoyPointerUp);
      }
      if (sprintBtn) {
        sprintBtn.addEventListener('click', onSprintClick);
      }
      if (flashBtn) {
        flashBtn.addEventListener('click', onFlashBtnClick);
      }
      if (pcBtn) {
        pcBtn.addEventListener('click', onPcBtnClick);
      }
    }

    function detachListeners() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('contextmenu', onCanvasRightClick);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      if (joyBase) {
        joyBase.removeEventListener('pointerdown', onJoyPointerDown);
        joyBase.removeEventListener('pointermove', onJoyPointerMove);
        joyBase.removeEventListener('pointerup', onJoyPointerUp);
        joyBase.removeEventListener('pointercancel', onJoyPointerUp);
      }
      if (sprintBtn) {
        sprintBtn.removeEventListener('click', onSprintClick);
      }
      if (flashBtn) {
        flashBtn.removeEventListener('click', onFlashBtnClick);
      }
      if (pcBtn) {
        pcBtn.removeEventListener('click', onPcBtnClick);
      }
      resetJoystick();
      lookTouchId = null;
      touchPrev = null;
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock?.();
      }
    }

    function enter(realm, enterOpts) {
      currentRealm = realm === 'level0' ? 'level0' : 'plains';
      const fromSkyFall = Boolean(enterOpts && enterOpts.fromSkyFall);
      active = true;
      renderer.shadowMap.enabled = false;
      keys = Object.create(null);
      resetJoystick();
      mobileSprint = false;
      if (sprintBtn) {
        sprintBtn.classList.remove('is-active');
        sprintBtn.setAttribute('aria-pressed', 'false');
      }
      canvas.style.touchAction = 'none';
      const isTouchLike =
        (window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse), (max-width: 900px)').matches) ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0);
      if (hudEl) {
        hudEl.classList.toggle('has-touch', !!isTouchLike);
      }
      if (levelLabel) {
        levelLabel.textContent = currentRealm === 'level0'
          ? 'LEVEL 0 · THE LOBBY'
          : 'LEVEL 94 · MOTION (PLAINS)';
      }
      if (flashBtn) {
        flashBtn.hidden = currentRealm !== 'level0';
      }
      if (pcBtn) pcBtn.hidden = true;
      l0CameraOn = false;
      l0CamOffWanderTimer = 0;
      l0NextAmbushAt = 3.6;
      l0AmbushBoost = 0;
      l0StareTimer = 0;
      l0TeleportCount = 0;
      l0CaughtReason = null;
      l0CamViewUniform = 0;
      l0PcBaseX = L0_PC_ALCOVES[0][0];
      l0PcBaseZ = L0_PC_ALCOVES[0][1];
      l0PcPos.set(l0PcBaseX, 0, l0PcBaseZ);
      l0PcGroup.position.copy(l0PcPos);
      l0PcDist = 99;
      l0PcRestarting = false;
      l0PcRestartTime = 0;
      l0PcRestarted = false;
      l0PcResetFired = false;
      camMoveBlend = 0;
      camSprintBlend = 0;
      camRollCur = 0;
      camLatCur = 0;
      camPitchBobCur = 0;
      camTurnRollCur = 0;
      camLagInit = false;
      fallActive = fromSkyFall;
      fallVy = fromSkyFall ? -4.5 : 0;
      fallPassedCeiling = false;
      landRecoverTimer = 0;
      fallRollPhase = 0;
      camFovCur = fromSkyFall ? 106 : BODYCAM_BASE_FOV;
      setL0Camera(false, true);
      l0KnowsPlayer = true;
      l0LastKnownPos.set(0, 0, 0);
      l0PatrolTarget.set(0, 0, -14);

      if (hintLabel) {
        if (currentRealm === 'level0') {
          hintLabel.textContent = isTouchLike
            ? 'Left stick · Drag look · Tap CAMERA to spot her (don\'t stare!) · Find & restart the PC'
            : 'WASD move · F / Right-Click camera (don\'t stare!) · Find PC & [E] restart · ESC wake up';
        } else {
          hintLabel.textContent = isTouchLike
            ? 'Left stick to move · Drag screen to look · Tap RUN'
            : 'WASD move · Move mouse or click for 360° look · ESC wake up';
        }
      }
      wrapCount = 0;
      loopDistance = 0;
      darkness = 0;
      watcherVisible = true;
      watcherDisappearCount = 0;
      watcherFollowCount = 0;
      watcherRespawnTimer = 0;
      l0PetVisible = false;
      l0PetDisappearCount = 0;
      l0Danger = 0;
      l0Caught = false;
      l0GrabTime = 0;
      l0GrabClosedFired = false;
      l0HeartbeatTimer = 0;
      l0RunPhase = 0;
      bfsTimer = 0;
      if (dangerEl) dangerEl.style.setProperty('--danger', '0');
      if (jumpscareSpanEl) jumpscareSpanEl.textContent = 'SHE GOT YOU';
      if (jumpscareEl) {
        jumpscareEl.classList.remove('is-reboot');
        jumpscareEl.hidden = true;
      }
      brCamera.rotation.z = 0;
      if (brCamera.fov !== camFovCur) {
        brCamera.fov = camFovCur;
        brCamera.updateProjectionMatrix();
      }

      lastMouseX = null;
      lastMouseY = null;

      if (currentRealm === 'level0') {
        const startY = fromSkyFall ? 13.5 : 1.44;
        pos.set(0, startY, 0);
        yaw = 0.0;
        pitch = fromSkyFall ? -0.78 : -0.02;
        syncBodyCamLagImmediate(startY);
        watcherGroup.visible = false;
        placeL0PetFarAway(0, 0, 29, 35);
        l0ChaserGroup.visible = false;
        restoreChaserBindPose();
        if (l0SprintAction) {
          l0SprintAction.reset();
          l0SprintAction.enabled = true;
          l0SprintAction.setEffectiveWeight(1);
          l0SprintAction.play();
        }
        l0MatReset();
        wrapLevel0Entities();
      } else {
        const startY = terrainY(0, 0) + (fromSkyFall ? 24.0 : 1.44);
        pos.set(0, startY, 0);
        yaw = 0.06;
        pitch = fromSkyFall ? -0.68 : -0.02;
        syncBodyCamLagImmediate(startY);
        placeWatcherOnHill(0, 0, 20, 29);
        watcherGroup.visible = watcherLoaded;
        syncAtmosphereLighting();
      }

      if (hudEl) {
        hudEl.hidden = false;
        hudEl.classList.add('is-active');
      }
      attachListeners();
      startAmbience(currentRealm);
    }

    function l0MatReset() {
      for (let i = 0; i < cMaterials.length; i++) {
        cMaterials[i].emissive.setRGB(0.24, 0.07, 0.28);
      }
      l0ChaserGlow.color.setHex(0xd8b4fe);
      l0ChaserGlow.intensity = 0.9;
      l0FloorMat.uniforms.uDanger.value = 0;
      l0CeilMat.uniforms.uDanger.value = 0;
      l0WallMat.uniforms.uDanger.value = 0;
    }

    function exit() {
      if (!active) return;
      active = false;
      renderer.setRenderTarget(null);
      renderer.shadowMap.enabled = true;
      if (dangerEl) dangerEl.style.setProperty('--danger', '0');
      if (jumpscareEl) jumpscareEl.hidden = true;
      brCamera.rotation.z = 0;
      if (brCamera.fov !== BODYCAM_BASE_FOV) {
        brCamera.fov = BODYCAM_BASE_FOV;
        brCamera.updateProjectionMatrix();
      }
      canvas.style.touchAction = '';
      watcherGroup.visible = false;
      l0ChaserGroup.visible = false;
      detachListeners();
      stopAmbience();
      if (hudEl) {
        hudEl.classList.remove('is-active');
        hudEl.hidden = true;
      }
      if (flashBtn) flashBtn.hidden = true;
      if (pcBtn) pcBtn.hidden = true;
      if (camViewEl) {
        camViewEl.hidden = true;
        camViewEl.classList.remove('is-active', 'is-warn');
      }
      camMoveBlend = 0;
      camSprintBlend = 0;
      camRollCur = 0;
      camLatCur = 0;
      camPitchBobCur = 0;
      camTurnRollCur = 0;
      camLagInit = false;
      fallActive = false;
      fallVy = 0;
      landRecoverTimer = 0;
      camFovCur = BODYCAM_BASE_FOV;
      l0CamViewUniform = 0;
      onExit();
    }

    function renderActiveScene() {
      renderer.setRenderTarget(vhsTarget);
      renderer.clear();
      renderer.render(currentRealm === 'level0' ? l0Scene : brScene, brCamera);
      lastSceneRenderCalls = renderer.info && renderer.info.render ? renderer.info.render.calls : 0;
      renderer.setRenderTarget(null);
      vhsPostMat.uniforms.uTime.value = brTime;
      vhsPostMat.uniforms.uRealm.value = currentRealm === 'level0' ? 1.0 : 0.0;
      vhsPostMat.uniforms.uCamView.value = l0CamViewUniform;
      vhsPostMat.uniforms.uIntensity.value = 1.0 + (currentRealm === 'level0' ? l0Danger * 1.45 : 0) + vhsGlitchSpike * 1.25;
      renderer.render(vhsPostScene, vhsPostCam);
    }

    function update(dt) {
      if (!active) return false;
      stepSimulation(dt);
      renderActiveScene();
      return true;
    }

    function stepForTest(dz, dYaw, dtSim, directStepX, directStepZ, testOpts) {
      if (!active) return;
      if (typeof dYaw === 'number') yaw += dYaw;
      if (typeof directStepX === 'number' || typeof directStepZ === 'number') {
        stepSimulation(dtSim || 0.04, directStepX, directStepZ, testOpts);
      } else if (dz) {
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        stepSimulation(dtSim || 0.05, fx * dz, fz * dz, testOpts);
      } else {
        stepSimulation(dtSim || 0.04, 0, 0, testOpts);
      }
      renderActiveScene();
    }

    function teleportForTest(nx, nz, nYaw, petX, petZ) {
      if (!active) return;
      fallActive = false;
      fallVy = 0;
      landRecoverTimer = 0;
      pos.x = nx;
      pos.z = nz;
      if (typeof nYaw === 'number') yaw = nYaw;
      syncBodyCamLagImmediate(currentRealm === 'level0' ? 1.44 : terrainY(nx, nz) + 1.44);
      if (typeof petX === 'number' && typeof petZ === 'number' && currentRealm === 'level0') {
        l0PetPos.set(petX, 0, petZ);
        l0ChaserGroup.position.copy(l0PetPos);
      }
      if (currentRealm === 'level0') wrapLevel0Entities();
      else wrapWorldEntities();
      stepSimulation(0.016, 0, 0);
      renderActiveScene();
    }

    function getDebugState() {
      const nh = getNearestHouseWorld(pos.x, pos.z);
      const nw = getNearestL0Wall(pos.x, pos.z);
      const l0PetDist = Math.hypot(l0PetPos.x - pos.x, l0PetPos.z - pos.z);
      return {
        realm: currentRealm,
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
        watcherFollowCount,
        plainsFogEnabled: Boolean(brScene.fog),
        plainsVisibleHouses,
        plainsTotalHouses: plainsHouseTiles.length,
        renderCalls: lastSceneRenderCalls,
        vhsFilterActive: true,
        watcherPos: {
          x: +watcherPos.x.toFixed(2),
          y: +watcherPos.y.toFixed(2),
          z: +watcherPos.z.toFixed(2),
        },
        nearestHouse: nh ? { x: +nh.x.toFixed(2), z: +nh.z.toFixed(2), rot: +nh.rot.toFixed(3), dist: +nh.dist.toFixed(2) } : null,
        insideAnyHouse: isInsideAnyHouse(pos.x, pos.z),
        houseCount: housePlacements.length,
        l0CeilingHeight: L0_H,
        l0FogDensity,
        l0TileGridCount: l0TileGroups.length,
        l0ChaserLoaded,
        l0CameraOn,
        l0FlashlightOn: l0CameraOn,
        l0ChaserVisible: l0ChaserGroup.visible,
        l0StareTimer: +l0StareTimer.toFixed(2),
        l0CamOffWanderTimer: +l0CamOffWanderTimer.toFixed(2),
        l0TeleportCount,
        l0CaughtReason,
        l0HumActive,
        bodyCamRoll: +brCamera.rotation.z.toFixed(4),
        bodyCamFov: +brCamera.fov.toFixed(1),
        bodyCamYawLag: +(yaw - camLagYaw).toFixed(4),
        bodyCamPosLag: +Math.hypot(brCamera.position.x - pos.x, brCamera.position.z - pos.z).toFixed(4),
        fisheyeEnabled: true,
        fallActive,
        fallHeight: +Math.max(0, pos.y - ((currentRealm === 'level0' ? 0 : terrainY(pos.x, pos.z)) + 1.44)).toFixed(2),
        landRecovering: landRecoverTimer > 0,
        l0PcPos: { x: +l0PcPos.x.toFixed(2), z: +l0PcPos.z.toFixed(2) },
        l0PcDist: +l0PcDist.toFixed(2),
        l0PcRestarting,
        l0PcRestarted,
        l0KnowsPlayer,
        l0SprintClip: l0SprintClipName,
        l0SprintPlaying: Boolean(l0SprintAction && l0SprintAction.isRunning()),
        l0PetLoaded: l0ChaserLoaded,
        l0PetVisible,
        l0PetDisappearCount,
        l0PetDist: +l0PetDist.toFixed(2),
        l0Danger: +l0Danger.toFixed(3),
        l0Caught,
        l0GrabTime: +l0GrabTime.toFixed(2),
        l0PetPos: { x: +l0PetPos.x.toFixed(2), y: +l0PetPos.y.toFixed(2), z: +l0PetPos.z.toFixed(2) },
        nearestL0Wall: nw ? { x: +nw.x.toFixed(2), z: +nw.z.toFixed(2), hw: +nw.hw.toFixed(2), hd: +nw.hd.toFixed(2), dist: +nw.dist.toFixed(2) } : null,
        insideAnyL0Wall: isInsideAnyL0Wall(pos.x, pos.z),
        l0WallCount: l0Walls.length,
        l0DecalCount: l0DecalSpecs.length,
        l0RareVisibleCount,
      };
    }

    function resize(w, h) {
      brCamera.aspect = Math.max(1, w) / Math.max(1, h);
      brCamera.updateProjectionMatrix();
      const sz = getVhsTargetSize(w, h);
      vhsTarget.setSize(sz.w, sz.h);
      vhsPostMat.uniforms.uResolution.value.set(sz.w, sz.h);
    }

    return {
      enter,
      setRealm: (r) => {
        if (active) enter(r);
        else currentRealm = r === 'level0' ? 'level0' : 'plains';
      },
      stepForTest,
      teleportForTest,
      setL0Camera: (on) => setL0Camera(on, true),
      triggerL0PcRestart,
      getDebugState,
      exit,
      isActive: () => active,
      getRealm: () => currentRealm,
      update,
      resize,
    };
  }

  global.WisteriaBackrooms = { create };
})(window);
