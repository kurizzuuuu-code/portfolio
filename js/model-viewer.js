/**
 * KURIZU 3D Character Model Viewer
 * Real-time WebGL interactive viewer for rigged-modelkurizu.glb
 * Hand-built with Three.js, orbit controls & animation blending.
 */
(() => {
  "use strict";

  function base64ToArrayBuffer(base64) {
    const binStr = atob(base64);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
    return bytes.buffer;
  }

  function initModelViewer() {
    const stage = document.getElementById("model3dStage");
    const canvas = document.getElementById("model3dCanvas");
    const loadingEl = document.getElementById("model3dLoading");
    const loadingText = document.getElementById("model3dLoadingText");
    const animButtons = document.querySelectorAll(".model3d-anim-btn");
    const speedBtn = document.getElementById("model3dSpeedBtn");
    const turntableBtn = document.getElementById("model3dTurntableBtn");
    const wireframeBtn = document.getElementById("model3dWireframeBtn");
    const resetCamBtn = document.getElementById("model3dResetCamBtn");
    const playPauseBtn = document.getElementById("model3dPlayPauseBtn");
    const lightBtn = document.getElementById("model3dLightBtn");
    const sparklesBtn = document.getElementById("model3dSparklesBtn");
    const snapBtn = document.getElementById("model3dSnapBtn");
    const camPresetBtns = document.querySelectorAll("[data-cam-preset]");
    const statusAnim = document.getElementById("model3dStatusAnim");

    if (!stage || !canvas) return;

    // Three.js Core
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, stage.clientWidth / stage.clientHeight, 0.1, 80);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
    } catch (e1) {
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: false,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: "default"
        });
      } catch (e2) {
        if (typeof THREE.WebGL1Renderer !== "undefined") {
          try {
            renderer = new THREE.WebGL1Renderer({ canvas, alpha: true, preserveDrawingBuffer: true });
          } catch (e3) {
            console.warn("[3D Viewer] WebGL1 fallback failed:", e3);
          }
        }
        if (!renderer) {
          console.warn("[3D Viewer] WebGL not available:", e2);
          if (loadingText) loadingText.textContent = "WEBGL NOT AVAILABLE — PLEASE ENABLE HARDWARE ACCELERATION";
          return;
        }
      }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    // Lighting Setup — Studio Brightness with Rich Contrast
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a206b, 1.25);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff8fa, 1.5);
    keyLight.position.set(3.2, 5.5, 4.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const frontFillLight = new THREE.DirectionalLight(0xffeefa, 1.0);
    frontFillLight.position.set(-3.0, 3.5, 3.5);
    scene.add(frontFillLight);

    const backKeyLight = new THREE.DirectionalLight(0xf0d4ff, 1.2);
    backKeyLight.position.set(0.0, 4.5, -4.0);
    scene.add(backKeyLight);

    const rimLight = new THREE.DirectionalLight(0xb56eff, 0.85);
    rimLight.position.set(-3.5, 2.5, -2.5);
    scene.add(rimLight);

    // Floor Shadow & Decorative Cyber Disc
    const floorGroup = new THREE.Group();
    const shadowGeo = new THREE.CircleGeometry(1.05, 36);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x160528,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.005;
    floorGroup.add(shadowMesh);

    // Soft glowing spotlight pool on floor
    const glowGeo = new THREE.CircleGeometry(1.4, 36);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x8a38c2,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.rotation.x = -Math.PI / 2;
    glowMesh.position.y = 0.003;
    floorGroup.add(glowMesh);

    const ringGeo = new THREE.RingGeometry(0.98, 1.05, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xdf94ff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.01;
    floorGroup.add(ringMesh);
    scene.add(floorGroup);

    // Floating 3D Starlight / Sparkle Particles
    const sparkleCount = 46;
    const sparkleGeo = new THREE.BufferGeometry();
    const sparklePos = new Float32Array(sparkleCount * 3);
    const sparkleSpeeds = new Float32Array(sparkleCount);
    for (let i = 0; i < sparkleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.55 + Math.random() * 1.45;
      sparklePos[i * 3] = Math.cos(angle) * dist;
      sparklePos[i * 3 + 1] = 0.1 + Math.random() * 2.4;
      sparklePos[i * 3 + 2] = Math.sin(angle) * dist;
      sparkleSpeeds[i] = 0.25 + Math.random() * 0.45;
    }
    sparkleGeo.setAttribute("position", new THREE.BufferAttribute(sparklePos, 3));
    const sparkleMat = new THREE.PointsMaterial({
      color: 0xffb3ec,
      size: 0.065,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const sparklePoints = new THREE.Points(sparkleGeo, sparkleMat);
    scene.add(sparklePoints);
    let sparklesVisible = true;

    // Camera Orbit State
    const defaultTarget = new THREE.Vector3(0, 1.15, 0);
    const target = defaultTarget.clone();
    const desiredTarget = defaultTarget.clone();
    let defaultRadius = 3.6, radius = defaultRadius;
    let defaultTheta = 0.35, theta = defaultTheta;
    let defaultPhi = 1.35, phi = defaultPhi;

    let targetTheta = theta, targetPhi = phi, targetRadius = radius;
    let autoRotate = true;
    let isDragging = false;
    let pointerX = 0, pointerY = 0;
    let pinchStartDist = 0;
    let activePointerCount = 0;

    function updateCameraPosition() {
      // Clamping
      targetPhi = Math.max(0.2, Math.min(Math.PI / 2 - 0.04, targetPhi));
      targetRadius = Math.max(1.2, Math.min(6.5, targetRadius));

      // Damping
      theta += (targetTheta - theta) * 0.12;
      phi += (targetPhi - phi) * 0.12;
      radius += (targetRadius - radius) * 0.14;
      target.lerp(desiredTarget, 0.14);

      const sinPhi = Math.sin(phi);
      camera.position.x = target.x + radius * sinPhi * Math.sin(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * sinPhi * Math.cos(theta);
      camera.lookAt(target);
    }
    updateCameraPosition();

    // Model and Animation State
    let characterModel = null;
    let mixer = null;
    const actions = {};
    let currentAction = null;
    let currentAnimName = "Sprint";
    let isPlaying = true;
    let timeScale = 1.0;
    let isWireframe = false;

    function onModelLoaded(gltf) {
      const model = gltf.scene;
      characterModel = model;
      model.updateMatrixWorld(true);

      // Measure skeleton / bounding box for scale
      const bones = {};
      model.traverse(o => { if (o.isBone) bones[o.name] = o; });
      const box = new THREE.Box3(), v = new THREE.Vector3();
      Object.keys(bones).forEach(k => { bones[k].getWorldPosition(v); box.expandByPoint(v); });
      const height = Math.max(0.001, (box.max.y - box.min.y) * 1.42);
      const scale = 2.4 / height;

      model.scale.setScalar(scale);
      model.position.y = -box.min.y * scale + 0.03;

      model.traverse(o => {
        if (o.isMesh) {
          o.frustumCulled = false;
          o.castShadow = true;
          o.receiveShadow = false;
          if (o.material) {
            o.userData.originalMaterial = o.material;
            if (o.material.isMeshStandardMaterial) {
              if (o.material.map) o.material.map.encoding = THREE.sRGBEncoding;
              o.material.emissive = new THREE.Color(0xffffff);
              if (o.material.map) o.material.emissiveMap = o.material.map;
              o.material.emissiveIntensity = 0.06;
              o.material.roughness = 0.72;
              o.material.metalness = 0.0;
              o.material.needsUpdate = true;
            }
          }
        }
      });

      scene.add(model);

      // Setup Animation Mixer & Actions
      mixer = new THREE.AnimationMixer(model);
      const mkAction = (name, once) => {
        const clip = THREE.AnimationClip.findByName(gltf.animations, name);
        if (!clip) return null;
        const act = mixer.clipAction(clip);
        act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
        act.clampWhenFinished = !!once;
        return act;
      };

      actions["Sprint"] = mkAction("Sprint", false);
      actions["Jog To Flip"] = mkAction("Jog To Flip", true);
      actions["Slide Start"] = mkAction("Slide Start", true);
      actions["Slide"] = mkAction("Slide", false);
      actions["Slide Exit"] = mkAction("Slide Exit", true);

      // Automatically blend out of one-shot jump flip into Sprint
      mixer.addEventListener("finished", (e) => {
        if (e.action === actions["Jog To Flip"] || e.action === actions["Slide Exit"]) {
          playAnimation("Sprint", 0.35);
        } else if (e.action === actions["Slide Start"]) {
          playAnimation("Slide", 0.15);
        }
      });

      // Start with Sprint
      playAnimation("Sprint", 0.0);

      if (loadingEl) {
        loadingEl.classList.add("hidden");
        setTimeout(() => { loadingEl.style.display = "none"; }, 400);
      }
    }

    function playAnimation(name, fadeDuration = 0.25) {
      const nextAction = actions[name];
      if (!nextAction) return;

      if (currentAction && currentAction !== nextAction) {
        currentAction.fadeOut(fadeDuration);
      }

      nextAction.reset();
      nextAction.setEffectiveTimeScale(timeScale);
      nextAction.setEffectiveWeight(1.0);
      if (fadeDuration > 0) nextAction.fadeIn(fadeDuration);
      nextAction.play();

      currentAction = nextAction;
      currentAnimName = name;

      if (statusAnim) statusAnim.textContent = name;

      // Update button active state
      animButtons.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.anim === name);
      });
    }

    // Load Model (Base64 first for zero-CORS / offline file:// support, fallback to .glb file)
    const loader = new THREE.GLTFLoader();
    const b64 = (typeof window !== "undefined" && window.PLAYER_MODEL_BASE64) ? window.PLAYER_MODEL_BASE64 : null;

    if (b64) {
      if (loadingText) loadingText.textContent = "DECODING MODEL DATA...";
      try {
        const arrayBuf = base64ToArrayBuffer(b64);
        loader.parse(arrayBuf, "", onModelLoaded, err => {
          console.warn("[3D Viewer] Base64 parse failed, attempting file load:", err);
          loadFromFile();
        });
      } catch (err) {
        console.warn("[3D Viewer] Error decoding base64:", err);
        loadFromFile();
      }
    } else {
      loadFromFile();
    }

    function loadFromFile() {
      if (loadingText) loadingText.textContent = "LOADING RIGGED-MODELKURIZU.GLB...";
      loader.load("game/rigged-modelkurizu.glb", onModelLoaded, undefined, err => {
        console.error("[3D Viewer] Could not load GLB file:", err);
        if (loadingText) loadingText.textContent = "FAILED TO LOAD 3D MODEL";
      });
    }

    // Pointer Event Listeners for Orbiting & Zooming
    const pointers = new Map();

    stage.addEventListener("pointerdown", e => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      activePointerCount = pointers.size;
      autoRotate = false;
      if (activePointerCount === 1) {
        isDragging = true;
        pointerX = e.clientX;
        pointerY = e.clientY;
      } else if (activePointerCount === 2) {
        const pts = Array.from(pointers.values());
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
      try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    });

    stage.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointerCount === 1 && isDragging) {
        const dx = e.clientX - pointerX;
        const dy = e.clientY - pointerY;
        pointerX = e.clientX;
        pointerY = e.clientY;

        targetTheta -= dx * 0.007;
        targetPhi += dy * 0.006;
      } else if (activePointerCount === 2) {
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const diff = pinchStartDist - dist;
        pinchStartDist = dist;
        targetRadius += diff * 0.01;
      }
    });

    const onPointerEnd = e => {
      pointers.delete(e.pointerId);
      activePointerCount = pointers.size;
      if (activePointerCount < 2) pinchStartDist = 0;
      if (activePointerCount === 0) isDragging = false;
    };

    stage.addEventListener("pointerup", onPointerEnd);
    stage.addEventListener("pointercancel", onPointerEnd);

    stage.addEventListener("wheel", e => {
      e.preventDefault();
      targetRadius += e.deltaY * 0.0028;
    }, { passive: false });

    // UI Buttons Hookup
    animButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const anim = btn.dataset.anim;
        if (anim) playAnimation(anim, 0.25);
      });
    });

    if (playPauseBtn) {
      playPauseBtn.addEventListener("click", () => {
        isPlaying = !isPlaying;
        if (currentAction) currentAction.paused = !isPlaying;
        playPauseBtn.innerHTML = isPlaying ? '<svg class="icon"><use href="#i-pause"/></svg>PAUSE' : '<svg class="icon"><use href="#i-play"/></svg>PLAY';
        playPauseBtn.classList.toggle("active", !isPlaying);
      });
    }

    if (speedBtn) {
      const speeds = [1.0, 1.5, 0.5];
      let speedIdx = 0;
      speedBtn.addEventListener("click", () => {
        speedIdx = (speedIdx + 1) % speeds.length;
        timeScale = speeds[speedIdx];
        if (mixer) mixer.timeScale = timeScale;
        const speedLabel = speedBtn.querySelector('span'); if (speedLabel) speedLabel.textContent = `SPEED: ${timeScale}x`; else speedBtn.textContent = `SPEED: ${timeScale}x`;
      });
    }

    if (turntableBtn) {
      turntableBtn.addEventListener("click", () => {
        autoRotate = !autoRotate;
        turntableBtn.classList.toggle("active", autoRotate);
      });
      turntableBtn.classList.add("active");
    }

    if (wireframeBtn) {
      wireframeBtn.addEventListener("click", () => {
        isWireframe = !isWireframe;
        wireframeBtn.classList.toggle("active", isWireframe);
        if (characterModel) {
          characterModel.traverse(o => {
            if (o.isMesh && o.material) {
              o.material.wireframe = isWireframe;
            }
          });
        }
      });
    }

    const lightPresets = [
      {
        name: "STUDIO",
        label: "LIGHT: STUDIO",
        ambient: 0.70,
        hemi: 1.30,
        key: 1.6,
        front: 1.1,
        back: 1.3,
        rim: 0.9,
        exposure: 1.12,
        emissive: 0.08
      },
      {
        name: "BRIGHT+",
        label: "LIGHT: BRIGHT+",
        ambient: 1.05,
        hemi: 1.65,
        key: 2.1,
        front: 1.5,
        back: 1.6,
        rim: 1.2,
        exposure: 1.25,
        emissive: 0.16
      },
      {
        name: "MOODY",
        label: "LIGHT: MOODY",
        ambient: 0.35,
        hemi: 0.85,
        key: 1.2,
        front: 0.6,
        back: 0.9,
        rim: 0.7,
        exposure: 1.0,
        emissive: 0.02
      }
    ];
    let lightPresetIdx = 0;

    function applyLightPreset(idx) {
      lightPresetIdx = (idx + lightPresets.length) % lightPresets.length;
      const p = lightPresets[lightPresetIdx];
      ambientLight.intensity = p.ambient;
      hemiLight.intensity = p.hemi;
      keyLight.intensity = p.key;
      frontFillLight.intensity = p.front;
      backKeyLight.intensity = p.back;
      rimLight.intensity = p.rim;
      renderer.toneMappingExposure = p.exposure;
      if (characterModel) {
        characterModel.traverse(o => {
          if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
            o.material.emissiveIntensity = p.emissive;
            o.material.needsUpdate = true;
          }
        });
      }
      if (lightBtn) { const lightLabel = lightBtn.querySelector('span'); if (lightLabel) lightLabel.textContent = p.label; else lightBtn.textContent = p.label; }
    }

    if (lightBtn) {
      lightBtn.addEventListener("click", () => {
        applyLightPreset(lightPresetIdx + 1);
      });
    }

    if (resetCamBtn) {
      resetCamBtn.addEventListener("click", () => {
        targetTheta = defaultTheta;
        targetPhi = defaultPhi;
        targetRadius = defaultRadius;
        desiredTarget.copy(defaultTarget);
        autoRotate = true;
        if (turntableBtn) turntableBtn.classList.add("active");
        camPresetBtns.forEach(b => b.classList.remove("active"));
      });
    }

    // Camera Presets
    const camPresets = {
      front: { theta: 0.0, phi: 1.38, radius: 3.5, targetY: 1.15 },
      face: { theta: 0.15, phi: 1.42, radius: 1.55, targetY: 1.68 },
      action: { theta: -0.6, phi: 1.18, radius: 3.1, targetY: 1.05 }
    };
    camPresetBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.camPreset;
        const p = camPresets[key];
        if (!p) return;
        targetTheta = p.theta;
        targetPhi = p.phi;
        targetRadius = p.radius;
        desiredTarget.set(0, p.targetY, 0);
        autoRotate = false;
        if (turntableBtn) turntableBtn.classList.remove("active");
        camPresetBtns.forEach(b => b.classList.toggle("active", b === btn));
      });
    });

    // Sparkles Toggle
    if (sparklesBtn) {
      sparklesBtn.addEventListener("click", () => {
        sparklesVisible = !sparklesVisible;
        sparklePoints.visible = sparklesVisible;
        sparklesBtn.classList.toggle("active", sparklesVisible);
      });
    }

    // Snapshot Capture
    if (snapBtn) {
      snapBtn.addEventListener("click", () => {
        try {
          renderer.render(scene, camera);
          const dataUrl = canvas.toDataURL("image/png");
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = `kurizu-3d-${currentAnimName.toLowerCase().replace(/\s+/g, "-")}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          stage.classList.add("is-flashing");
          setTimeout(() => stage.classList.remove("is-flashing"), 320);
        } catch (err) {
          console.warn("[3D Viewer] Snapshot failed:", err);
        }
      });
    }

    // Responsive Canvas Resize
    function onResize() {
      if (!stage || !renderer || !camera) return;
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", onResize);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(onResize).observe(stage);
    }

    // Animation Render Loop
    const clock = new THREE.Clock();
    window.__kurizuViewer = {
      setAngle: (t, p, r) => {
        if (t !== undefined) { targetTheta = t; theta = t; }
        if (p !== undefined) { targetPhi = p; phi = p; }
        if (r !== undefined) { targetRadius = r; radius = r; }
      },
      setAutoRotate: (val) => { autoRotate = val; },
      playAnim: (name) => { playAnimation(name); },
      setLightPreset: (idx) => { applyLightPreset(idx); },
      getModel: () => characterModel
    };
    const winEl = document.getElementById("kurizu3d");
    const gameDlg = document.getElementById("gameDialog");
    function animate() {
      requestAnimationFrame(animate);
      const dt = clock.getDelta();
      // Skip 3D rendering when kurizu_3d.exe window is closed/minimized or game modal is open
      if (document.hidden || (winEl && (winEl.classList.contains("is-closed") || winEl.classList.contains("is-minimized"))) || (gameDlg && gameDlg.open)) {
        return;
      }

      if (mixer && isPlaying) mixer.update(dt);

      if (autoRotate && !isDragging) {
        targetTheta += dt * 0.45;
      }

      if (sparklesVisible) {
        const posAttr = sparkleGeo.getAttribute("position");
        for (let i = 0; i < sparkleCount; i++) {
          let y = posAttr.getY(i) + sparkleSpeeds[i] * dt;
          if (y > 2.55) y = 0.08;
          posAttr.setY(i, y);
        }
        posAttr.needsUpdate = true;
        sparklePoints.rotation.y += dt * 0.18;
      }

      ringMesh.rotation.z += dt * 0.35;
      updateCameraPosition();
      renderer.render(scene, camera);
    }
    animate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initModelViewer);
  } else {
    initModelViewer();
  }
})();
