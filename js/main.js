/* ============================================================
   KURIZU — interactions
   Renders content from js/site.config.js, then wires up the
   desktop: filters, case studies, search, reel, sound, clocks.
   No dependencies, no build step.
   ============================================================ */
(() => {
  "use strict";

  const config = window.KURIZU;
  if (!config) {
    console.error("KURIZU config not found — check js/site.config.js");
    return;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  const esc = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch]);

  const icon = (name, cls = "") =>
    `<svg class="icon${cls ? ` ${cls}` : ""}" aria-hidden="true"><use href="#i-${esc(name)}"/></svg>`;

  const pad = (n) => String(n).padStart(2, "0");
  const projectById = (id) => config.projects.find((project) => project.id === id);

  /* ---------- scroll lock (menus + dialogs) ---------- */
  let scrollLocks = 0;
  function lockScroll() {
    if (scrollLocks === 0) document.body.style.overflow = "hidden";
    scrollLocks += 1;
  }
  function unlockScroll() {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.body.style.overflow = "";
  }

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove("is-visible"), 2400);
  }

  /* ============================================================
     8-BIT RETRO WEB AUDIO SFX SYNTHESIZER
     ============================================================ */
  let sfxEnabled = true;
  let audioCtx = null;

  try {
    const savedSfx = window.localStorage.getItem("kurizu.sfx");
    if (savedSfx !== null) sfxEnabled = savedSfx === "true";
  } catch (_) {}

  function getAudioCtx() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playSfx(kind = "click", force = false) {
    if (!sfxEnabled && !force) return;
    const ctx = getAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (kind === "click") {
      osc.type = "square";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.045);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (kind === "hover") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.018, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.start(now);
      osc.stop(now + 0.028);
    } else if (kind === "pop") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.075, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.095);
    } else if (kind === "coin") {
      osc.type = "square";
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.setValueAtTime(1318.51, now + 0.06); // E6
      gain.gain.setValueAtTime(0.085, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (kind === "powerup") {
      osc.type = "square";
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      });
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (kind === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.linearRampToValueAtTime(130, now + 0.14);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.16);
    }
  }
  const playUiSfx = playSfx;

  function updateSfxUI() {
    const btn = $("#sfxToggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(sfxEnabled));
    btn.classList.toggle("is-off", !sfxEnabled);
    const label = btn.querySelector(".sfx-label");
    if (label) label.textContent = sfxEnabled ? "sfx on" : "sfx off";
  }

  function initSfx() {
    updateSfxUI();
    $("#sfxToggle")?.addEventListener("click", () => {
      sfxEnabled = !sfxEnabled;
      try { window.localStorage.setItem("kurizu.sfx", String(sfxEnabled)); } catch (_) {}
      updateSfxUI();
      if (sfxEnabled) playSfx("coin");
      toast(sfxEnabled ? "8-bit UI sounds on ♪" : "8-bit UI sounds muted");
    });

    // Global subtle click & hover sound delegation
    document.addEventListener("pointerdown", (e) => {
      const target = e.target.closest("button, a, .project-card, .chip-list li, [data-term-cmd], .pet-chip");
      if (target && target.id !== "sfxToggle") {
        playSfx("click");
      }
    }, { passive: true });
  }

  /* ============================================================
     SOCIALS + LINKS
     ============================================================ */
  function renderSocials() {
    const ids = new Set(["youtube", "github", "instagram", "tiktok"]);

    $$("[data-socials]").forEach((slot) => {
      const kind = slot.dataset.socials;

      slot.innerHTML = config.socials.map((social) => {
        const symbol = ids.has(social.id) ? social.id : "globe";
        const url = esc(social.url);
        const label = esc(social.label);
        const handle = esc(social.handle);

        if (kind === "rows") {
          return `<a class="social-row" data-social="${esc(social.id)}" href="${url}" target="_blank" rel="noopener" aria-label="${label} — ${handle}">
            <span class="social-row__icon">${icon(symbol)}</span>
            <span class="social-row__label">${label}</span>
            <span class="social-row__handle">${handle}</span>
            ${icon("arrow-ur", "social-row__arrow")}
          </a>`;
        }

        if (kind === "menu") {
          return `<a class="mobile-social" href="${url}" target="_blank" rel="noopener">
            ${icon(symbol)}<span>${label}</span>
          </a>`;
        }

        if (kind === "icons") {
          return `<a class="social-icon" href="${url}" target="_blank" rel="noopener" aria-label="${label} — ${handle}" title="${label}">${icon(symbol)}</a>`;
        }

        if (kind === "footer") {
          return `<a class="footer__social" href="${url}" target="_blank" rel="noopener">${label}<span>${handle}</span></a>`;
        }

        return "";
      }).join("");
    });
  }

  function renderWebsiteLinks() {
    $$("[data-website]").forEach((link) => {
      link.href = config.website.url;
      link.title = config.website.url;
    });
    $$("[data-website-label]").forEach((el) => { el.textContent = config.website.label; });
    $$("[data-website-label-small]").forEach((el) => { el.textContent = config.website.label; });
  }

  function renderKofiLinks() {
    const donate = config.donate;
    if (!donate || !donate.url) return;

    $$("[data-kofi]").forEach((link) => {
      link.href = donate.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.title = `support me on ${donate.label || "ko-fi"}`;
      link.setAttribute("aria-label", `Support me on ${donate.label || "Ko-fi"}`);
      const label = link.querySelector("[data-kofi-label]");
      if (label && donate.label) label.textContent = donate.label;
    });
  }

  function renderContactActions() {
    const slot = $("#contactActions");
    if (!slot) return;

    const copy = {
      instagram: "DM me on Instagram",
      youtube: "watch on YouTube",
      tiktok: "catch me on TikTok",
      github: "stalk my GitHub",
      email: "send a real email",
    };
    const order = ["instagram", "youtube", "tiktok", "github"];
    const socials = order
      .map((id) => config.socials.find((social) => social.id === id))
      .filter(Boolean);

    let html = "";

    if (config.email) {
      html += `<a class="contact-action" data-social="email" href="mailto:${esc(config.email)}">
        <span class="contact-action__icon">${icon("mail")}</span>
        <span class="contact-action__text"><strong>${esc(copy.email)}</strong><span>${esc(config.email)}</span></span>
        ${icon("arrow-ur", "contact-action__arrow")}
      </a>`;
    }

    html += socials.map((social) => {
      const symbol = ["youtube", "github", "instagram", "tiktok"].includes(social.id) ? social.id : "globe";
      return `<a class="contact-action" data-social="${esc(social.id)}" href="${esc(social.url)}" target="_blank" rel="noopener">
        <span class="contact-action__icon">${icon(symbol)}</span>
        <span class="contact-action__text"><strong>${esc(copy[social.id] || `find me on ${social.label}`)}</strong><span>${esc(social.handle)}</span></span>
        ${icon("arrow-ur", "contact-action__arrow")}
      </a>`;
    }).join("");

    slot.innerHTML = html;
  }

  function renderAvailability() {
    $$("[data-availability]").forEach((el) => {
      el.textContent = config.available ? config.availability : "heads down, building";
    });
  }

  /* ============================================================
     PROJECTS
     ============================================================ */
  const state = { category: "all", view: "grid", skill: "" };

  function filteredProjects() {
    return config.projects.filter((project) => {
      const catMatch = state.category === "all" || project.category === state.category;
      const skillMatch = !state.skill || (project.tags || []).some((t) => t.toLowerCase().includes(state.skill.toLowerCase()));
      return catMatch && skillMatch;
    });
  }

  function renderCategories() {
    const slot = $("#categoryList");
    if (!slot) return;

    slot.innerHTML = config.categories.map((category) => {
      const count = category.id === "all"
        ? config.projects.length
        : config.projects.filter((project) => project.category === category.id).length;
      const active = category.id === state.category;
      return `<button type="button" class="category${active ? " is-active" : ""}" data-category="${esc(category.id)}" aria-pressed="${active}">
        <span class="category__icon">${icon(category.icon || "folder")}</span>
        <span class="category__label">${esc(category.label)}</span>
        <span class="category__count">${count}</span>
      </button>`;
    }).join("");
  }

  function renderProjects() {
    const slot = $("#projectsGrid");
    if (!slot) return;

    slot.innerHTML = config.projects.map((project) => {
      const tags = (project.tags || []).slice(0, 3).map((tag) => `<li>${esc(tag)}</li>`).join("");
      const progress = /progress/i.test(project.status || "");
      return `<article class="project-card" data-id="${esc(project.id)}" data-category="${esc(project.category)}" tabindex="0" role="button" aria-label="Open ${esc(project.title)} case study">
        <div class="project-card__media">
          <img src="${esc(project.image)}" alt="${esc(project.imageAlt || project.title)}" width="640" height="420" loading="lazy">
          <span class="project-card__badge${project.isNew ? " project-card__badge--new" : ""}">${project.isNew ? "✦ NEW" : project.featured ? "★ featured" : esc(project.year)}</span>
          <span class="project-card__open">open case study ${icon("arrow-ur")}</span>
        </div>
        <div class="project-card__body">
          <div class="project-card__top">
            <span class="project-card__cat">${esc(project.categoryLabel)}</span>
            <span class="project-card__year">${esc(project.year)}</span>
          </div>
          <h3>${esc(project.title)}<span class="project-card__sub">${esc(project.subtitle)}</span></h3>
          <p class="project-card__blurb">${esc(project.blurb)}</p>
          <ul class="project-card__tags" aria-label="Tools">${tags}</ul>
          <div class="project-card__foot">
            <span class="project-card__status${progress ? " is-progress" : ""}">${esc(project.status)}</span>
            <span class="project-card__rating" data-rating-badge="${esc(project.id)}" title="Community star rating">☆ rate</span>
            <span class="project-card__more">read more +</span>
          </div>
        </div>
        <span class="project-card__glare" aria-hidden="true"></span>
      </article>`;
    }).join("");

    applyFilter(state.category, true);
  }

  function renderFeaturedMini() {
    const slot = $("#featuredMini");
    if (!slot) return;

    const items = config.projects.filter((project) => project.mini).slice(0, 3);
    const fallback = items.length ? items : config.projects.slice(0, 3);

    slot.innerHTML = fallback.map((project) => `<a class="featured-mini__item" href="#project-${esc(project.id)}" data-project="${esc(project.id)}" aria-label="Open ${esc(project.title)}">
      <img src="${esc(project.image)}" alt="" width="64" height="64" loading="lazy">
      <span class="featured-mini__text">
        <strong>${esc(project.title)}</strong>
        <span>${esc(project.categoryLabel)}</span>
      </span>
      ${icon("arrow-ur")}
    </a>`).join("");
  }

  function renderVideoLinks() {
    const slot = $("#videoLinks");
    if (!slot) return;

    slot.innerHTML = config.videoLinks.map((video) => {
      const thumb = `<span class="video-card__thumb">
        <img src="${esc(video.art)}" alt="" loading="lazy">
        <span class="video-card__play">${icon("play")}</span>
        <span class="video-card__kicker">${esc(video.kicker)}</span>
      </span>`;
      const body = `<span class="video-card__body">
        <strong>${esc(video.title)}</strong>
        <span>${esc(video.note)}</span>
        <span class="video-card__watch">${video.project ? "open the showcase" : "watch on youtube"} ${icon("arrow-ur")}</span>
      </span>`;

      if (video.project) {
        return `<button type="button" class="video-card" data-project="${esc(video.project)}" aria-label="Open ${esc(video.title)}">
          ${thumb}${body}
        </button>`;
      }

      return `<a class="video-card" href="${esc(video.url)}" target="_blank" rel="noopener">
        ${thumb}${body}
      </a>`;
    }).join("");
  }

  function applyFilter(categoryId, initial = false) {
    state.category = categoryId;
    const projects = filteredProjects();
    const visibleIds = new Set(projects.map((p) => p.id));
    const cards = $$("#projectsGrid .project-card");

    cards.forEach((card) => {
      const show = visibleIds.has(card.dataset.id);
      card.classList.toggle("is-hidden", !show);
    });

    $$("#categoryList .category").forEach((button) => {
      const active = button.dataset.category === categoryId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    $$("#toolkitChips li[data-skill]").forEach((chip) => {
      chip.classList.toggle("is-active", state.skill !== "" && chip.dataset.skill === state.skill);
    });

    const category = config.categories.find((item) => item.id === categoryId);
    const baseLabel = category ? category.label : "everything";
    const label = state.skill ? `${baseLabel} · ${state.skill}` : baseLabel;

    const countEl = $("#resultCount");
    if (countEl) countEl.textContent = `${projects.length} ${projects.length === 1 ? "item" : "items"}`;

    const breadcrumb = $("#breadcrumbCurrent");
    if (breadcrumb) breadcrumb.textContent = label;

    let empty = $("#projectsGrid .projects-empty");
    if (!projects.length && !empty) {
      empty = document.createElement("p");
      empty.className = "projects-empty";
      empty.innerHTML = "nothing in this folder yet<span>try another filter or click a category on the left ♡</span>";
      $("#projectsGrid")?.append(empty);
    } else if (projects.length && empty) {
      empty.remove();
    }

    if (!initial && (categoryId !== "all" || state.skill) && projects.length) {
      const explorer = $(".explorer");
      if (explorer && window.innerWidth < 860) {
        explorer.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    }
  }

  function setView(view) {
    state.view = view;
    $("#projectsGrid")?.classList.toggle("is-list", view === "list");
    $$(".view-btn").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  /* ============================================================
     DIALOGS
     ============================================================ */
  const projectDialog = $("#projectDialog");
  const lightbox = $("#lightbox");
  const kurizuGateDialog = $("#kurizuGateDialog");

  function openDialog(dialog) {
    if (!dialog || typeof dialog.showModal !== "function") return false;
    if (!dialog.open) {
      dialog.showModal();
      lockScroll();
    }
    return true;
  }

  [projectDialog, lightbox, kurizuGateDialog].forEach((dialog) => {
    if (!dialog) return;
    dialog.addEventListener("close", unlockScroll);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  /* every close button (case study + lightbox) closes its dialog */
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-close-dialog]");
    if (!button) return;
    const dialog = button.closest("dialog");
    if (dialog && typeof dialog.close === "function" && dialog.open) dialog.close();
  });

  let currentCaseGallery = [];

  function caseStudyMarkup(project) {
    const progress = /progress/i.test(project.status || "");
    const highlights = (project.highlights || []).map((item) => `<li>${esc(item)}</li>`).join("");
    const tags = (project.tags || []).map((tag) => `<li>${esc(tag)}</li>`).join("");
    const gallery = (project.gallery || []).map((src, index) =>
      `<img src="${esc(src)}" alt="${esc(project.title)} preview ${index + 1}" data-case-image="${index}" loading="lazy">`
    ).join("");
    const links = (project.links || []).map((link) => {
      const cls = `btn btn--small${link.primary ? " btn--primary" : ""}`;
      if (link.download) {
        return `<a class="${cls}" href="${esc(link.url)}" download="${esc(link.download)}">${icon(link.icon || "download")}${esc(link.label)}</a>`;
      }
      return `<a class="${cls}" href="${esc(link.url)}" target="_blank" rel="noopener">${icon(link.icon || "external")}${esc(link.label)}</a>`;
    }).join("");
    const videos = project.videos && project.videos.length
      ? project.videos
      : project.video
        ? [project.video]
        : [];
    const videoMarkup = videos.map((video) => `<figure class="case__video">
          <video src="${esc(video.src)}" poster="${esc(video.poster)}" controls playsinline preload="none" aria-label="${esc(video.label || `${project.title} showcase`)}"></video>
          ${videos.length > 1 && video.label ? `<figcaption>${esc(video.label)}</figcaption>` : ""}
        </figure>`).join("");

    const compareMarkup = project.id === "pixify" && (project.gallery || []).length >= 2
      ? `<div class="case__section">
          <h3>${icon("sparkle")} interactive before / after inspector</h3>
          <div class="case__compare" id="caseCompare" style="--split: 50%;">
            <img class="case__compare-img case__compare-img--after" src="${esc(project.gallery[1])}" alt="Vector / SVG output">
            <div class="case__compare-before">
              <img class="case__compare-img" src="${esc(project.gallery[0])}" alt="Pixel grid detection">
            </div>
            <div class="case__compare-handle" aria-hidden="true"><span>↔</span></div>
            <span class="case__compare-tag case__compare-tag--l">pixel cleaner</span>
            <span class="case__compare-tag case__compare-tag--r">SVG vectorizer</span>
            <input type="range" class="case__compare-range" id="caseCompareRange" min="5" max="95" value="50" aria-label="Compare pixel cleaner and SVG vectorizer modes">
          </div>
        </div>`
      : "";

    const devlogs = Array.isArray(project.devlogs) ? project.devlogs : [];
    const devlogsMarkup = devlogs.length
      ? `<div class="case__section case__devlogs">
          <div class="case__devlogs-head">
            <h3>${icon("terminal")} devlog.txt · version history</h3>
            <span class="case__devlogs-count">${devlogs.length} ${devlogs.length === 1 ? "release" : "releases"}</span>
          </div>
          <div class="devlog-timeline">
            ${devlogs.map((entry, idx) => {
              const addedItems = Array.isArray(entry.added) ? entry.added : [];
              const changedItems = Array.isArray(entry.changed) ? entry.changed : [];
              return `<article class="devlog-entry${idx === 0 ? " is-latest" : ""}">
                <header class="devlog-entry__head">
                  <span class="devlog-entry__ver">${esc(entry.version || "v1.0")}</span>
                  ${entry.tag ? `<span class="devlog-entry__tag">${esc(entry.tag)}</span>` : ""}
                  ${entry.title ? `<strong class="devlog-entry__title">${esc(entry.title)}</strong>` : ""}
                </header>
                <div class="devlog-entry__body">
                  ${addedItems.length ? `<div class="devlog-group devlog-group--added">
                    <span class="devlog-badge devlog-badge--added">+ WHAT WAS ADDED</span>
                    <ul class="devlog-list">
                      ${addedItems.map((it) => `<li>${esc(it)}</li>`).join("")}
                    </ul>
                  </div>` : ""}
                  ${changedItems.length ? `<div class="devlog-group devlog-group--changed">
                    <span class="devlog-badge devlog-badge--changed">~ WHAT CHANGED / FIXED</span>
                    <ul class="devlog-list">
                      ${changedItems.map((it) => `<li>${esc(it)}</li>`).join("")}
                    </ul>
                  </div>` : ""}
                </div>
              </article>`;
            }).join("")}
          </div>
        </div>`
      : "";

    return `<div class="case__hero">
        <div class="case__hero-tilt">
          <img class="case__hero-img" src="${esc(project.image)}" alt="${esc(project.imageAlt || project.title)}">
          <span class="case__hero-shade" aria-hidden="true"></span>
          <div class="case__hero-text">
            <span class="case__kicker">${esc(project.categoryLabel)} · ${esc(project.year)}</span>
            <h2 id="projectDialogTitle">${esc(project.title)}</h2>
            <p>${esc(project.subtitle)}</p>
          </div>
        </div>
        <span class="case__hero-glare" aria-hidden="true"></span>
      </div>
      <div class="case__body">
        <div class="case__meta">
          <span>${esc(project.categoryLabel)}</span>
          <span>${esc(project.year)}</span>
          <span class="is-status">${esc(project.status)}</span>
        </div>
        <p class="case__summary">${esc(project.description || project.blurb)}</p>
        ${project.play ? `<div class="case__playbar">
          <div class="case__playbar-text">
            <strong>playable right here</strong>
            <span>three lanes · endless trail · keyboard or touch</span>
          </div>
          <button type="button" class="btn btn--small btn--primary" data-play-game>${icon("gamepad")} play the game</button>
        </div>` : ""}
        ${project.extensionInstallNote && links ? `<div class="case__playbar case__downloadbar">
          <div class="case__playbar-text">
            <strong>grab ${esc(project.title)} + browser extension</strong>
            <span>Windows desktop app + Chrome/Edge &amp; Firefox extension .zips</span>
          </div>
          <div class="case__downloadbar-actions">${links}</div>
        </div>` : ""}
        ${compareMarkup}
        ${videos.length ? `<div class="case__section">
          <h3>${icon("play")} ${videos.length > 1 ? "watch the videos" : "watch the showcase"}</h3>
          <div class="case__videos">${videoMarkup}</div>
        </div>` : ""}
        ${highlights ? `<div class="case__section">
          <h3>${icon("sparkle")} what makes it tick</h3>
          <ul class="case__list">${highlights}</ul>
        </div>` : ""}
        ${devlogsMarkup}
        ${gallery ? `<div class="case__section">
          <h3>${icon("folder")} screens & sprites</h3>
          <div class="case__gallery">${gallery}</div>
        </div>` : ""}
        <div class="case__section">
          <h3>${icon("puzzle")} built with</h3>
          <ul class="case__tags">${tags}</ul>
        </div>
        <div class="case__section">
          <h3>${icon("external")} find &amp; download it</h3>
          ${links ? `<div class="case__links">${links}</div>` : `<p class="case__note">${progress ? "still baking — ask me for a build ♡" : "source lives on my laptop (or in a folder named final_final_v3). ask me about it ♡"}</p>`}
          ${project.extensionInstallNote ? `<p class="case__ext-note">${esc(project.extensionInstallNote)}</p>` : ""}
        </div>
        <div class="case__section case__reviews" id="caseReviews" data-review-project="${esc(project.id)}">
          <div class="case-reviews__head">
            <h3>${icon("star")} ratings &amp; comments</h3>
            <div class="case-reviews__summary" id="caseReviewSummary">
              <span class="case-reviews__avg" id="caseReviewAvg">—</span>
              <span class="case-reviews__stars-display" id="caseReviewStarsDisplay" aria-hidden="true">☆☆☆☆☆</span>
              <span class="case-reviews__count" id="caseReviewCount">be the first to rate ♡</span>
            </div>
          </div>
          <form class="case-reviews__form" id="caseReviewForm" novalidate>
            <div class="case-reviews__picker-row">
              <span class="case-reviews__label">your rating:</span>
              <div class="star-picker" id="caseStarPicker" role="radiogroup" aria-label="Rate this project from 1 to 5 stars">
                ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-picker__btn" data-star="${n}" aria-label="${n} star${n > 1 ? "s" : ""}" aria-checked="false" role="radio">★</button>`).join("")}
              </div>
              <span class="case-reviews__picked-text" id="caseStarText">click a star</span>
            </div>
            <div class="case-reviews__inputs">
              <div class="review-admin-identity" id="caseReviewAdminIdentity" hidden>
                <img src="assets/sprites/avatar-still.webp" alt="kurizu" width="34" height="34">
                <div>
                  <strong>kurizu<span>.exe</span> <span class="review-badge--op">★ admin</span></strong>
                  <span>commenting as kurizu</span>
                </div>
              </div>
              <input type="text" id="caseReviewName" class="case-reviews__input" placeholder="your name (optional)" maxlength="24" autocomplete="nickname">
              <textarea id="caseReviewText" class="case-reviews__textarea" placeholder="leave a comment or feedback on ${esc(project.title)}..." maxlength="400" rows="3"></textarea>
            </div>
            <div class="case-reviews__actions">
              <span class="case-reviews__char" id="caseReviewChar">0 / 400</span>
              <span class="case-reviews__status" id="caseReviewStatus" aria-live="polite"></span>
              <button type="submit" class="btn btn--small btn--primary" id="caseReviewSubmit">post review ★</button>
            </div>
          </form>
          <div class="case-reviews__toolbar">
            <span class="case-reviews__toolbar-info" id="caseCommentsToolbarInfo">comments</span>
            <label class="case-reviews__sort">
              <span>sort</span>
              <select id="caseReviewSort" class="case-reviews__sort-select" aria-label="Sort comments">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="highest">Highest rated</option>
                <option value="lowest">Lowest rated</option>
                <option value="most_replies">Most replies</option>
                <option value="status">Fixed / Not Fixed first</option>
              </select>
            </label>
          </div>
          <div class="case-reviews__list" id="caseCommentsList">
            <p class="case-reviews__empty">loading comments…</p>
          </div>
        </div>
      </div>`;
  }

  function openProject(id, options = {}) {
    const project = projectById(id);
    if (!project) return;

    currentCaseGallery = (project.gallery || []).map((src, index) => ({
      image: src,
      title: `${project.title} · ${index + 1}`,
      meta: project.categoryLabel,
      alt: `${project.title} preview ${index + 1}`,
    }));

    const content = $("#projectContent");
    if (content) content.innerHTML = caseStudyMarkup(project);

    const compareEl = $("#caseCompare");
    const compareRange = $("#caseCompareRange");
    if (compareEl && compareRange) {
      compareRange.addEventListener("input", () => {
        compareEl.style.setProperty("--split", `${compareRange.value}%`);
      });
    }

    initCaseTilt();
    initCaseReviews(project.id);

    const fileTitle = (APP_EXTENSIONS[project.id] && APP_EXTENSIONS[project.id].file) || `${project.id}.exe`;
    const titleEl = $("#appWindowTitleText");
    if (titleEl) titleEl.textContent = fileTitle;
    const appWinInfo = managedWindows.get("app");
    if (appWinInfo) {
      appWinInfo.title = fileTitle;
      openDesktopWindow("app");
      const scroll = $("#projectContent");
      if (scroll) scroll.scrollTop = 0;
    } else if (openDialog(projectDialog)) {
      const scroll = $(".modal__scroll", projectDialog);
      if (scroll) scroll.scrollTop = 0;
    }

    if (options.hash !== false) {
      try {
        history.replaceState(null, "", `#project-${project.id}`);
      } catch (error) {
        /* file:// can refuse history changes — no big deal */
      }
    }
  }

  if (projectDialog) {
    projectDialog.addEventListener("close", () => {
      if (window.location.hash.startsWith("#project-")) {
        try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch (error) { /* noop */ }
      }
      // a closed case-study video means the player gets its music back
      if (musicPausedForVideo) resumeMusicAfterVideo();
    });
  }

  /* ============================================================
     PARALLAX TICKET — tilt, depth and glare on cards + hero
     ============================================================ */
  const canTilt = finePointer && !reduceMotion;

  function createTilt(surface, options = {}) {
    const target = options.target || surface;
    const glare = options.glare ? surface.querySelector(options.glare) : null;
    const max = options.max == null ? 8 : options.max;
    const lift = options.lift == null ? 0 : options.lift;
    const scale = options.scale == null ? 1 : options.scale;
    const baseScale = options.baseScale == null ? 1 : options.baseScale;
    const ease = options.ease == null ? 0.16 : options.ease;
    const s = { tx: 0, ty: 0, x: 0, y: 0, lift: 0, tlift: 0, g: 0, tg: 0, gx: 50, gy: 30 };
    let raf = 0;
    let hover = false;

    function apply() {
      surface.style.setProperty("--tx", s.x.toFixed(4));
      surface.style.setProperty("--ty", s.y.toFixed(4));
      if (glare) {
        glare.style.opacity = s.g.toFixed(3);
        glare.style.setProperty("--gx", `${s.gx.toFixed(1)}%`);
        glare.style.setProperty("--gy", `${s.gy.toFixed(1)}%`);
      }
      const lr = lift ? Math.min(1, Math.max(0, s.lift / lift)) : 0;
      target.style.transform =
        `perspective(900px) rotateX(${(-s.y * max).toFixed(3)}deg) rotateY(${(s.x * max).toFixed(3)}deg)` +
        ` translateY(${(-lift * lr).toFixed(2)}px) scale(${(baseScale + (scale - 1) * lr).toFixed(4)})`;
    }

    function frame() {
      raf = 0;
      s.x += (s.tx - s.x) * ease;
      s.y += (s.ty - s.y) * ease;
      s.lift += (s.tlift - s.lift) * ease;
      s.g += (s.tg - s.g) * 0.12;
      apply();

      const settled =
        Math.abs(s.tx - s.x) < 0.0006 &&
        Math.abs(s.ty - s.y) < 0.0006 &&
        Math.abs(s.tlift - s.lift) < 0.01 &&
        Math.abs(s.tg - s.g) < 0.004;

      if (settled && !hover) {
        target.style.transform = "";
        surface.style.removeProperty("--tx");
        surface.style.removeProperty("--ty");
        if (glare) glare.style.opacity = "";
        surface.classList.remove("is-tilting");
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function track(event) {
      const rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      s.tx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
      s.ty = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
      s.gx = (s.tx + 1) * 50;
      s.gy = (s.ty + 1) * 50;
    }

    surface.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      hover = true;
      surface.classList.add("is-tilting");
      s.tlift = lift;
      s.tg = glare ? 1 : 0;
      track(event);
      wake();
    });
    surface.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || !hover) return;
      track(event);
      wake();
    });
    surface.addEventListener("pointerleave", () => {
      hover = false;
      s.tx = 0;
      s.ty = 0;
      s.tlift = 0;
      s.tg = 0;
      wake();
    });
  }

  function initCardTilt() {
    if (!canTilt) return;
    document.documentElement.classList.add("tilt-js");
    $$("#projectsGrid .project-card").forEach((card) => {
      createTilt(card, { max: 7, lift: 5, scale: 1.02, glare: ".project-card__glare" });
    });
  }

  function initCaseTilt() {
    if (!canTilt) return;
    const hero = $("#projectContent .case__hero");
    if (!hero) return;
    createTilt(hero, {
      target: $(".case__hero-tilt", hero),
      max: 5,
      baseScale: 1.06,
      glare: ".case__hero-glare",
    });
  }

  /* ---------- gallery + lightbox ---------- */
  const galleryFilters = [
    { id: "all", label: "everything" },
    { id: "digital", label: "digital" },
    { id: "traditional", label: "traditional" },
    { id: "projects", label: "projects" },
  ];
  const galleryState = { filter: "all" };
  let galleryItems = config.gallery;
  let lightboxItems = config.gallery;
  let lightboxIndex = 0;

  const AUTO_ART_CATEGORIES = ["digital", "traditional"];
  const ART_IMAGE_RE = /\.(webp|png|jpe?g|gif|avif)$/i;
  const ART_FULL_SUFFIX_RE = /-full$/i;

  function encodeArtPath(category, filename) {
    return `assets/arts/${category}/${encodeURIComponent(filename)}`;
  }

  function decodeBasename(pathStr) {
    const clean = String(pathStr || "").split(/[?#]/)[0];
    const raw = clean.split("/").pop() || "";
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  }

  function fileKeyFromPath(pathStr) {
    return decodeBasename(pathStr).toLowerCase();
  }

  function stemKeyFromPath(pathStr) {
    return fileKeyFromPath(pathStr)
      .replace(/\.[^.]+$/, "")
      .replace(ART_FULL_SUFFIX_RE, "");
  }

  function formatArtTitle(filename) {
    const clean = decodeBasename(filename)
      .replace(/\.[^.]+$/, "")
      .replace(ART_FULL_SUFFIX_RE, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return clean || "untitled piece";
  }

  function groupRawArtFilenames(filenames) {
    const groups = new Map();
    for (const rawName of filenames) {
      const name = decodeBasename(rawName).trim();
      if (!name || name.startsWith(".") || !ART_IMAGE_RE.test(name)) continue;
      const stem = stemKeyFromPath(name);
      let group = groups.get(stem);
      if (!group) {
        group = { thumb: null, full: null };
        groups.set(stem, group);
      }
      const isFull = ART_FULL_SUFFIX_RE.test(name.replace(/\.[^.]+$/, ""));
      if (isFull) {
        if (!group.full) group.full = name;
      } else if (!group.thumb) {
        group.thumb = name;
      }
    }

    const entries = [];
    for (const group of groups.values()) {
      const file = group.thumb || group.full;
      if (!file) continue;
      entries.push({
        file,
        full: group.full && group.full !== file ? group.full : null,
        animated: /\.gif$/i.test(file),
      });
    }
    return entries;
  }

  function mergeAutoGalleryEntries(categoryData, options = {}) {
    if (!categoryData || typeof categoryData !== "object") return false;
    const pruneMissing = Boolean(options.pruneMissing);
    const current = Array.isArray(config.gallery) ? config.gallery : [];

    const existingByCat = new Map();
    const otherItems = [];
    for (const item of current) {
      const cat = item.category || "digital";
      if (AUTO_ART_CATEGORIES.includes(cat)) {
        if (!existingByCat.has(cat)) existingByCat.set(cat, []);
        existingByCat.get(cat).push(item);
      } else {
        otherItems.push(item);
      }
    }

    let changed = false;
    const rebuiltByCat = new Map();

    for (const cat of AUTO_ART_CATEGORIES) {
      const existingList = existingByCat.get(cat) || [];
      const incoming = Array.isArray(categoryData[cat]) ? categoryData[cat] : null;
      if (!incoming) {
        rebuiltByCat.set(cat, existingList);
        continue;
      }

      const incomingFileKeys = new Set();
      const incomingStemKeys = new Set();
      const incomingByKey = new Map();
      for (const entry of incoming) {
        if (!entry || !entry.file) continue;
        const fKey = fileKeyFromPath(entry.file);
        const sKey = stemKeyFromPath(entry.file);
        incomingFileKeys.add(fKey);
        incomingStemKeys.add(sKey);
        if (!incomingByKey.has(fKey)) incomingByKey.set(fKey, entry);
      }

      const seenExistingFiles = new Set();
      const seenExistingStems = new Set();
      const keptExisting = [];
      for (const item of existingList) {
        const fKey = fileKeyFromPath(item.image);
        const sKey = stemKeyFromPath(item.image);
        if (pruneMissing && incoming.length > 0 && !incomingFileKeys.has(fKey) && !incomingStemKeys.has(sKey)) {
          changed = true;
          continue;
        }
        seenExistingFiles.add(fKey);
        seenExistingStems.add(sKey);
        keptExisting.push(item);
      }

      const newItems = [];
      for (const entry of incoming) {
        if (!entry || !entry.file) continue;
        const fKey = fileKeyFromPath(entry.file);
        const sKey = stemKeyFromPath(entry.file);
        if (seenExistingFiles.has(fKey) || seenExistingStems.has(sKey)) continue;

        seenExistingFiles.add(fKey);
        seenExistingStems.add(sKey);
        const title = formatArtTitle(entry.file);
        const imagePath = encodeArtPath(cat, entry.file);
        const fullPath = entry.full ? encodeArtPath(cat, entry.full) : imagePath;
        const isTrad = cat === "traditional";
        newItems.push({
          image: imagePath,
          full: fullPath,
          title,
          meta: isTrad ? "traditional · sketchbook" : "digital art",
          alt: `${title} — ${isTrad ? "pencil drawing from the sketchbook" : "digital artwork"}`,
          category: cat,
          animated: Boolean(entry.animated || /\.gif$/i.test(entry.file)),
        });
      }

      if (newItems.length > 0) changed = true;
      rebuiltByCat.set(cat, [...newItems, ...keptExisting]);
    }

    if (!changed) return false;

    config.gallery = [
      ...(rebuiltByCat.get("digital") || []),
      ...(rebuiltByCat.get("traditional") || []),
      ...otherItems,
    ];
    renderGalleryFilters();
    renderGallery();
    return true;
  }

  async function scanLocalDirectoryArt(category) {
    const res = await fetch(`assets/arts/${category}/`, { cache: "no-cache" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(doc.querySelectorAll("a[href]"));
    const filenames = [];
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("?") || href.startsWith("#") || href === "../" || href.endsWith("/")) continue;
      const base = decodeBasename(href);
      if (ART_IMAGE_RE.test(base)) filenames.push(base);
    }
    if (!filenames.length) return null;
    return groupRawArtFilenames(filenames);
  }

  async function fetchGitHubArtFallback() {
    const CACHE_KEY = "kurizu.art.gh.v1";
    const CACHE_TTL = 5 * 60 * 1000;
    try {
      const raw = window.sessionStorage?.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Date.now() - parsed.ts < CACHE_TTL && parsed.data) {
          return parsed.data;
        }
      }
    } catch (_) {}

    const result = {};
    for (const cat of AUTO_ART_CATEGORIES) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/kurizzuuuu-code/portfolio/contents/assets/arts/${cat}`,
          { headers: { Accept: "application/vnd.github+json" } }
        );
        if (!res.ok) continue;
        const list = await res.json();
        if (!Array.isArray(list)) continue;
        const names = list
          .filter((item) => item && item.type === "file" && ART_IMAGE_RE.test(item.name || ""))
          .map((item) => item.name);
        if (names.length) result[cat] = groupRawArtFilenames(names);
      } catch (_) {}
    }

    if (result.digital || result.traditional) {
      try {
        window.sessionStorage?.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: result }));
      } catch (_) {}
    }
    return result;
  }

  async function syncAutoGallery() {
    if (window.location.protocol === "file:") return;

    let manifestLoaded = false;
    try {
      const res = await fetch("assets/arts/manifest.json", { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        if (data && (Array.isArray(data.digital) || Array.isArray(data.traditional))) {
          manifestLoaded = true;
          mergeAutoGalleryEntries(data, { pruneMissing: true });
        }
      }
    } catch (_) {}

    const host = window.location.hostname;
    const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    if (isLocalHost) {
      try {
        const localData = {};
        const results = await Promise.all(AUTO_ART_CATEGORIES.map((cat) => scanLocalDirectoryArt(cat)));
        AUTO_ART_CATEGORIES.forEach((cat, idx) => {
          if (results[idx]) localData[cat] = results[idx];
        });
        if (localData.digital || localData.traditional) {
          mergeAutoGalleryEntries(localData, { pruneMissing: true });
        }
      } catch (_) {}
      return;
    }

    if (window.location.protocol.startsWith("http")) {
      try {
        const ghData = await fetchGitHubArtFallback();
        if (ghData && (ghData.digital || ghData.traditional)) {
          mergeAutoGalleryEntries(ghData, { pruneMissing: !manifestLoaded });
        }
      } catch (_) {}
    }
  }

  function filteredGallery() {
    return galleryState.filter === "all"
      ? config.gallery
      : config.gallery.filter((item) => (item.category || "digital") === galleryState.filter);
  }

  function renderGalleryFilters() {
    const slot = $("#galleryFilters");
    if (!slot) return;

    slot.innerHTML = galleryFilters.map((filter) => {
      const count = filter.id === "all"
        ? config.gallery.length
        : config.gallery.filter((item) => (item.category || "digital") === filter.id).length;
      const active = galleryState.filter === filter.id;
      return `<button type="button" class="gallery-filter${active ? " is-active" : ""}" data-gallery-filter="${esc(filter.id)}" aria-pressed="${active}">
        ${esc(filter.label)} <span>${count}</span>
      </button>`;
    }).join("");
  }

  function renderGallery() {
    const slot = $("#gallery");
    if (!slot) return;

    galleryItems = filteredGallery();
    slot.innerHTML = galleryItems.map((item, index) => `<button type="button" class="gallery__item" data-index="${index}" aria-label="View ${esc(item.title)}">
      <img src="${esc(item.image)}" alt="${esc(item.alt || item.title)}" loading="lazy">
      ${item.animated ? '<span class="gallery__badge">gif</span>' : ""}
      <span class="gallery__zoom">${icon("search")}</span>
      <span class="gallery__info">
        <strong>${esc(item.title)}</strong>
        <span>${esc(item.meta)}</span>
      </span>
    </button>`).join("");

    const count = $("#galleryCount");
    if (count) count.textContent = String(galleryItems.length);
  }

  function setGalleryFilter(id) {
    galleryState.filter = id;
    renderGalleryFilters();
    renderGallery();
  }

  $("#galleryFilters")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gallery-filter]");
    if (!button) return;
    setGalleryFilter(button.dataset.galleryFilter);
  });

  function updateLightbox() {
    const item = lightboxItems[lightboxIndex];
    if (!item) return;

    const image = $("#lightboxImage");
    if (image) {
      image.src = item.full || item.image;
      image.alt = item.alt || item.title;
    }
    const title = $("#lightboxTitle");
    if (title) title.textContent = `${item.title} · ${lightboxIndex + 1}/${lightboxItems.length}`;
    const meta = $("#lightboxMeta");
    if (meta) meta.textContent = `${item.meta || "art"} · ${lightboxIndex + 1} of ${lightboxItems.length}`;
    const caption = $("#lightboxCaption");
    if (caption) caption.textContent = item.title;
  }

  function openLightbox(index, items) {
    if (Array.isArray(items) && items.length) lightboxItems = items;
    else lightboxItems = galleryItems;
    lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
    updateLightbox();
    openDialog(lightbox);
  }

  function stepLightbox(delta) {
    if (!lightboxItems.length) return;
    lightboxIndex = (lightboxIndex + delta + lightboxItems.length) % lightboxItems.length;
    updateLightbox();
  }

  $("#lightboxPrev")?.addEventListener("click", () => stepLightbox(-1));
  $("#lightboxNext")?.addEventListener("click", () => stepLightbox(1));

  if (lightbox) {
    lightbox.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); stepLightbox(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); stepLightbox(1); }
    });
  }

  /* ============================================================
     EVENT DELEGATION — projects / featured / gallery
     ============================================================ */
  function wireProjectOpeners() {
    $("#projectsGrid")?.addEventListener("click", (event) => {
      const card = event.target.closest(".project-card");
      if (card) openProject(card.dataset.id);
    });

    $("#projectsGrid")?.addEventListener("keydown", (event) => {
      const card = event.target.closest(".project-card");
      if (!card) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProject(card.dataset.id);
      }
    });

    $("#featuredMini")?.addEventListener("click", (event) => {
      const link = event.target.closest("[data-project]");
      if (!link) return;
      event.preventDefault();
      openProject(link.dataset.project);
    });

    $("#videoLinks")?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-project]");
      if (!card) return;
      openProject(card.dataset.project);
    });

    $("#gallery")?.addEventListener("click", (event) => {
      const item = event.target.closest(".gallery__item");
      if (!item) return;
      openLightbox(Number(item.dataset.index));
    });

    $("#projectContent")?.addEventListener("click", (event) => {
      const image = event.target.closest("[data-case-image]");
      if (!image || !currentCaseGallery.length) return;
      openLightbox(Number(image.dataset.caseImage), currentCaseGallery);
    });

    $("#categoryList")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-category]");
      if (!btn) return;
      state.skill = "";
      applyFilter(btn.dataset.category);
    });

    $$(".view-btn").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    $("#toolkitChips")?.addEventListener("click", (event) => {
      const chip = event.target.closest("li[data-skill]");
      if (!chip) return;
      const skill = chip.dataset.skill;
      state.skill = state.skill === skill ? "" : skill;
      applyFilter("all");
      if (state.skill) {
        toast(`filtering projects by ${state.skill} ✨`);
        $("#work")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    });
  }

  /* ============================================================
     SHOWREEL
     ============================================================ */
  const reelWindow = $("#reel");
  const reelSlidesEl = $("#reelSlides");
  let reelIndex = 0;
  let reelPlaying = false;
  let reelTimer = 0;
  let reelProgress = 0;

  function setReel(index) {
    const slides = config.showreel.slides || [];
    if (!slides.length) return;

    reelIndex = (index + slides.length) % slides.length;
    reelProgress = 0;

    $$(".reel__slide", reelSlidesEl).forEach((slide, i) => {
      slide.classList.toggle("is-active", i === reelIndex);
    });
    $$(".reel__dot", $("#reelDots")).forEach((dot, i) => {
      dot.classList.toggle("is-active", i === reelIndex);
      dot.setAttribute("aria-label", `Show slide ${i + 1}: ${slides[i].kicker}`);
    });

    const slide = slides[reelIndex];
    const kicker = $("#reelKicker");
    const title = $("#reelTitle");
    const counter = $("#reelCounter");
    const bar = $("#reelProgress");
    if (kicker) kicker.textContent = slide.kicker;
    if (title) title.textContent = slide.caption;
    if (counter) counter.textContent = `${pad(reelIndex + 1)} / ${pad(slides.length)}`;
    if (bar) bar.style.width = "0%";
  }

  function buildReel() {
    if (!reelSlidesEl) return;
    const slides = config.showreel.slides || [];
    const dots = $("#reelDots");

    reelSlidesEl.innerHTML = slides.map((slide, i) => `<figure class="reel__slide${i === 0 ? " is-active" : ""}">
      <img src="${esc(slide.image)}" alt="${esc(slide.caption || slide.kicker)}" ${i > 0 ? 'loading="lazy"' : ""}>
    </figure>`).join("");

    if (dots) {
      dots.innerHTML = slides.map((slide, i) =>
        `<button type="button" class="reel__dot${i === 0 ? " is-active" : ""}" data-slide="${i}" aria-label="Show slide ${i + 1}: ${esc(slide.kicker)}"></button>`
      ).join("");
    }

    setReel(0);
  }

  function setReelPlaying(playing) {
    if (!reelWindow) return;
    if (playing === reelPlaying) return;
    reelPlaying = playing;

    reelWindow.classList.toggle("is-playing", playing);
    const toggle = $("#reelToggle");
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(playing));
      toggle.setAttribute("aria-label", playing ? "Pause showreel" : "Play showreel");
    }
    const label = $(".reel__play-label");
    if (label) label.textContent = playing ? "pause reel" : "play reel";
    const badge = $("#reelState");
    if (badge) badge.textContent = playing ? "playing" : "paused";

    window.clearInterval(reelTimer);
    if (playing) {
      reelProgress = 0;
      reelTimer = window.setInterval(() => {
        const slides = config.showreel.slides || [];
        if (!slides.length) return;
        reelProgress += (80 / 4600) * 100;
        if (reelProgress >= 100) {
          setReel(reelIndex + 1);
        } else {
          const bar = $("#reelProgress");
          if (bar) bar.style.width = `${Math.min(100, reelProgress)}%`;
        }
      }, 80);
    }
  }

  $("#reelToggle")?.addEventListener("click", () => setReelPlaying(!reelPlaying));
  $("#reelStageBtn")?.addEventListener("click", () => setReel(reelIndex + 1));
  $("#reelDots")?.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-slide]");
    if (!dot) return;
    setReel(Number(dot.dataset.slide));
    if (reelPlaying) setReelPlaying(false);
  });
  $$("[data-start-reel]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      $("#media")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      window.setTimeout(() => setReelPlaying(true), reduceMotion ? 120 : 520);
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && reelPlaying) setReelPlaying(false);
  });

  /* ============================================================
     SEARCH
     ============================================================ */
  const searchForm = $("#siteSearchForm");
  const searchWrap = searchForm ? searchForm.closest(".search") : null;
  const searchInput = $("#siteSearch");
  const searchResults = $("#searchResults");
  const searchCloseBtn = $("#searchClose");
  let searchActive = -1;

  const sectionIndex = [
    { id: "about", title: "about me", sub: "the human behind the pixels", icon: "heart", href: "#about" },
    { id: "work", title: "selected work", sub: "projects, apps & experiments", icon: "folder", href: "#work" },
    { id: "arcade", title: "the arcade", sub: "play do not stop — forest run", icon: "gamepad", href: "#arcade" },
    { id: "media", title: "motion & art", sub: "the showreel and the gallery", icon: "play", href: "#media" },
    { id: "contact", title: "say hi", sub: "collabs, commissions & nice people", icon: "mail", href: "#contact" },
  ];

  const categoryIcons = { web: "globe", desktop: "desktop", games: "gamepad", mobile: "phone", extension: "puzzle" };

  function searchIndex() {
    return [
      ...sectionIndex.map((section) => ({ ...section, type: "section", haystack: `${section.title} ${section.sub}`.toLowerCase() })),
      ...config.projects.map((project) => ({
        id: project.id,
        type: "project",
        title: project.title,
        sub: `${project.categoryLabel} · ${project.subtitle}`,
        icon: categoryIcons[project.category] || "folder",
        href: `#project-${project.id}`,
        haystack: [project.title, project.subtitle, project.categoryLabel, project.blurb, project.year, (project.tags || []).join(" ")]
          .join(" ").toLowerCase(),
      })),
    ];
  }

  function closeSearch(clear = false) {
    if (searchResults) {
      searchResults.hidden = true;
      searchResults.innerHTML = "";
    }
    searchInput?.setAttribute("aria-expanded", "false");
    searchWrap?.classList.remove("is-open");
    searchActive = -1;
    if (clear && searchInput) searchInput.value = "";
  }

  function showSearch() {
    if (!searchInput || !searchResults) return;
    const query = searchInput.value.trim().toLowerCase();
    searchActive = -1;

    if (!query) {
      closeSearch(false);
      return;
    }

    const hits = searchIndex().filter((item) => item.haystack.includes(query)).slice(0, 8);

    if (!hits.length) {
      searchResults.innerHTML = `<p class="search-empty">nothing matches “<strong>${esc(query)}</strong>”<br>try “pixel”, “app”, “game” or “art”.</p>`;
    } else {
      searchResults.innerHTML = hits.map((item) => `<a class="search-result" role="option" aria-selected="false" href="${esc(item.href)}"${item.type === "project" ? ` data-search-project="${esc(item.id)}"` : ""}>
        <span class="search-result__icon">${icon(item.icon)}</span>
        <span class="search-result__text"><strong>${esc(item.title)}</strong><small>${esc(item.sub)}</small></span>
        <span class="search-result__type">${item.type}</span>
      </a>`).join("");
    }

    searchResults.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
  }

  function moveSearchActive(delta) {
    if (!searchResults) return;
    const results = $$(".search-result", searchResults);
    if (!results.length) return;

    searchActive = (searchActive + delta + results.length) % results.length;
    results.forEach((result, i) => {
      const active = i === searchActive;
      result.classList.toggle("is-active", active);
      result.setAttribute("aria-selected", String(active));
      if (active) result.scrollIntoView({ block: "nearest" });
    });
  }

  searchInput?.addEventListener("input", showSearch);
  searchInput?.addEventListener("focus", () => {
    if (searchInput.value.trim()) showSearch();
  });
  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); moveSearchActive(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveSearchActive(-1); }
    else if (event.key === "Enter" && searchActive >= 0) {
      const active = $$(".search-result", searchResults)[searchActive];
      if (active) { event.preventDefault(); active.click(); }
    } else if (event.key === "Escape") {
      closeSearch(true);
      searchInput.blur();
    }
  });

  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    if (window.innerWidth <= 760 && searchWrap && !searchWrap.classList.contains("is-open")) {
      searchWrap.classList.add("is-open");
      searchInput?.focus();
      return;
    }

    if (!searchInput || !searchInput.value.trim()) {
      searchInput?.focus();
      return;
    }

    if (searchResults?.hidden) showSearch();

    const first = $(".search-result", searchResults);
    if (first) first.click();
    else toast("no matches — try “pixel” or “app” ♡");
  });

  searchCloseBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    closeSearch(true);
    searchInput?.blur();
  });

  searchResults?.addEventListener("click", (event) => {
    const projectLink = event.target.closest("[data-search-project]");
    if (projectLink) {
      event.preventDefault();
      const id = projectLink.dataset.searchProject;
      closeSearch(true);
      searchInput?.blur();
      openProject(id);
      return;
    }

    if (event.target.closest("a.search-result")) {
      closeSearch(true);
    }
  });

  document.addEventListener("click", (event) => {
    if (!searchWrap || searchWrap.contains(event.target)) return;
    closeSearch(false);
  });

  /* keyboard: ⌘K / Ctrl+K */
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (window.innerWidth <= 760) searchWrap?.classList.add("is-open");
      searchInput?.focus();
      searchInput?.select();
    }
  });

  /* ============================================================
     MENUS
     ============================================================ */
  const mobileMenu = $("#mobileMenu");
  const menuToggle = $("#menuToggle");
  const startMenu = $("#startMenu");
  const startToggle = $("#startToggle");
  let menuOpen = false;
  let startOpen = false;

  function setMobileMenu(open) {
    if (!mobileMenu || open === menuOpen) return;
    menuOpen = open;
    mobileMenu.classList.toggle("is-open", open);
    mobileMenu.setAttribute("aria-hidden", String(!open));
    menuToggle?.setAttribute("aria-expanded", String(open));
    if (open) lockScroll();
    else unlockScroll();
  }

  function setStartMenu(open) {
    if (!startMenu || open === startOpen) return;
    startOpen = open;
    startMenu.hidden = !open;
    startToggle?.setAttribute("aria-expanded", String(open));
  }

  menuToggle?.addEventListener("click", () => setMobileMenu(!menuOpen));
  startToggle?.addEventListener("click", () => setStartMenu(!startOpen));

  mobileMenu?.addEventListener("click", (event) => {
    if (event.target === mobileMenu) setMobileMenu(false);
    if (event.target.closest("a")) setMobileMenu(false);
  });

  startMenu?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setStartMenu(false);
  });

  $("#startRestart")?.addEventListener("click", () => {
    setStartMenu(false);
    toast("soft resetting kurizu.exe... ♡");
    window.setTimeout(() => window.location.reload(), 650);
  });

  document.addEventListener("click", (event) => {
    if (startOpen && !startMenu?.contains(event.target) && !startToggle?.contains(event.target)) {
      setStartMenu(false);
    }
    if (menuOpen && !mobileMenu?.querySelector(".mobile-menu__panel")?.contains(event.target) && !menuToggle?.contains(event.target)) {
      setMobileMenu(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (startOpen) setStartMenu(false);
    if (menuOpen) setMobileMenu(false);
    if (searchWrap?.classList.contains("is-open")) closeSearch(false);
  });

  /* ============================================================
     MUSIC — playlist with autoplay, volume, shuffle & repeat
     ============================================================ */
  const musicTracks = Array.isArray(config.music) ? config.music : [];
  const player = new Audio();
  player.preload = "metadata";
  player.className = "bg-music";
  player.hidden = true;
  document.body.appendChild(player);

  let trackIndex = 0;
  let soundOn = false;
  let shuffleOn = false;
  let repeatMode = "off"; // off | all | one
  let gestureArmed = false;
  let playErrors = 0;

  /* Always start up at 15% volume (0.15) so the background theme is gentle on launch */
  player.volume = 0.15;
  try {
    const stored = JSON.parse(window.localStorage.getItem("kurizu.player.v2") || "{}");
    if (typeof stored.shuffle === "boolean") shuffleOn = stored.shuffle;
    if (stored.repeat === "all" || stored.repeat === "one") repeatMode = stored.repeat;
  } catch (error) { /* private mode — defaults are fine */ }

  function savePlayer() {
    try {
      window.localStorage.setItem("kurizu.player.v2", JSON.stringify({
        volume: player.volume,
        shuffle: shuffleOn,
        repeat: repeatMode,
      }));
    } catch (error) { /* noop */ }
  }

  function updatePlayerUI() {
    const track = musicTracks[trackIndex];
    $$("[data-track-title]").forEach((el) => { el.textContent = track ? track.title : "no tracks yet"; });

    document.body.classList.toggle("is-sound", soundOn);
    $$("[data-sound-toggle]").forEach((button) => {
      button.setAttribute("aria-pressed", String(soundOn));
      button.setAttribute("aria-label", soundOn ? "Pause music" : "Play music");
    });
    $$(".sound-label").forEach((label) => { label.textContent = soundOn ? "sound on" : "sound off"; });

    const shuffleBtn = $("#shuffleBtn");
    if (shuffleBtn) {
      shuffleBtn.classList.toggle("is-active", shuffleOn);
      shuffleBtn.setAttribute("aria-pressed", String(shuffleOn));
    }

    const repeatBtn = $("#repeatBtn");
    if (repeatBtn) {
      repeatBtn.dataset.state = repeatMode;
      repeatBtn.classList.toggle("is-active", repeatMode !== "off");
      repeatBtn.classList.toggle("is-one", repeatMode === "one");
      repeatBtn.setAttribute("aria-pressed", String(repeatMode !== "off"));
      repeatBtn.setAttribute("aria-label", `Repeat ${repeatMode === "one" ? "this track" : repeatMode === "all" ? "the playlist" : "off"}`);
    }

    const slider = $("#volumeSlider");
    const volPct = $("#volumePct");
    if (slider) {
      const value = Math.round(player.volume * 100);
      if (String(slider.value) !== String(value)) {
        slider.value = String(value);
      }
      slider.style.setProperty("--vol", `${value}%`);
      if (volPct) volPct.textContent = `${value}%`;
    }
  }

  function play() {
    if (!musicTracks.length) return;
    if (!player.getAttribute("src")) { loadTrack(trackIndex); return; }
    player.play().then(() => {
      soundOn = true;
      playErrors = 0;
      updatePlayerUI();
    }).catch(() => {
      soundOn = false;
      updatePlayerUI();
      armGestureStart();
    });
  }

  function pause() {
    player.pause();
    soundOn = false;
    updatePlayerUI();
  }

  function applyPlayerPitchAndRate(rate = 1) {
    try {
      const slow = rate < 0.96;
      if ("preservesPitch" in player) player.preservesPitch = !slow;
      if ("mozPreservesPitch" in player) player.mozPreservesPitch = !slow;
      if ("webkitPreservesPitch" in player) player.webkitPreservesPitch = !slow;
      player.playbackRate = rate;
    } catch (_) {}
  }

  function loadTrack(index, autoplay = true) {
    if (!musicTracks.length) return;
    trackIndex = ((index % musicTracks.length) + musicTracks.length) % musicTracks.length;
    player.src = encodeURI(musicTracks[trackIndex].src);
    if (document.body.classList.contains("is-wisteria-mad")) {
      applyPlayerPitchAndRate(0.52);
    } else {
      applyPlayerPitchAndRate(1);
    }
    updatePlayerUI();
    if (autoplay) play();
  }

  function nextTrack() {
    if (!musicTracks.length) return;
    let index = trackIndex + 1;
    if (shuffleOn && musicTracks.length > 1) {
      do { index = Math.floor(Math.random() * musicTracks.length); } while (index === trackIndex);
    }
    loadTrack(index);
  }

  function prevTrack() {
    if (!musicTracks.length) return;
    if (player.currentTime > 3) { player.currentTime = 0; return; }
    const index = shuffleOn && musicTracks.length > 1
      ? Math.floor(Math.random() * musicTracks.length)
      : trackIndex - 1;
    loadTrack(index);
  }

  /* browsers block autoplay with sound — start on the first interaction instead */
  function armGestureStart() {
    if (gestureArmed) return;
    gestureArmed = true;
    const start = () => {
      ["pointerdown", "keydown", "touchstart"].forEach((type) => document.removeEventListener(type, start, true));
      gestureArmed = false;
      play();
    };
    ["pointerdown", "keydown", "touchstart"].forEach((type) => document.addEventListener(type, start, true));
    toast("tap anywhere to start the music ♡");
  }

  player.addEventListener("play", () => {
    soundOn = true;
    if (document.body.classList.contains("is-wisteria-mad")) {
      applyPlayerPitchAndRate(0.52);
    }
    updatePlayerUI();
  });
  player.addEventListener("loadedmetadata", () => {
    if (document.body.classList.contains("is-wisteria-mad")) {
      applyPlayerPitchAndRate(0.52);
    }
  });
  player.addEventListener("pause", () => {
    if (!player.ended) {
      soundOn = false;
      updatePlayerUI();
    }
  });
  player.addEventListener("ended", () => {
    if (repeatMode === "one") {
      player.currentTime = 0;
      player.play().catch(armGestureStart);
      return;
    }
    const isLast = trackIndex === musicTracks.length - 1;
    if (shuffleOn || repeatMode === "all" || !isLast) nextTrack();
    else {
      soundOn = false;
      updatePlayerUI();
    }
  });
  player.addEventListener("error", () => {
    if (!player.getAttribute("src") || !musicTracks.length) return;
    playErrors += 1;
    if (playErrors > musicTracks.length) {
      toast("music could not be loaded ♡");
      soundOn = false;
      updatePlayerUI();
      return;
    }
    toast("that track wouldn't load — skipping ♡");
    window.setTimeout(nextTrack, 500);
  });

  $$("[data-sound-toggle]").forEach((button) => {
    button.addEventListener("click", () => { if (soundOn) pause(); else play(); });
  });
  $("#musicPrev")?.addEventListener("click", prevTrack);
  $("#musicNext")?.addEventListener("click", nextTrack);
  $("#shuffleBtn")?.addEventListener("click", () => {
    shuffleOn = !shuffleOn;
    savePlayer();
    updatePlayerUI();
    toast(shuffleOn ? "shuffle on ♡" : "shuffle off");
  });
  $("#repeatBtn")?.addEventListener("click", () => {
    repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    savePlayer();
    updatePlayerUI();
    toast(repeatMode === "one" ? "repeating this track ♡" : repeatMode === "all" ? "repeating the playlist ♡" : "repeat off");
  });
  const volumeSlider = $("#volumeSlider");
  const volumeContainer = $(".volume");
  const volumePct = $("#volumePct");
  let volumeMoveTimer = 0;

  function initVolumeSliderBubble() {
    if (!volumeSlider) return;
    const inject = () => {
      if (volumeSlider.shadowRoot && !volumeSlider.shadowRoot.querySelector("#skBubbleMoveStyle")) {
        const style = document.createElement("style");
        style.id = "skBubbleMoveStyle";
        style.textContent = `
          .val {
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.16s ease, transform 0.16s ease;
            z-index: 20;
          }
          :host(.is-moving) .val,
          .sld:hover .val,
          .sld:has(input:active) .val,
          .sld:has(input:focus-visible) .val {
            opacity: 1;
            pointer-events: auto;
          }
        `;
        volumeSlider.shadowRoot.appendChild(style);
      }
    };
    if (customElements.get("sakuga-slider")) inject();
    else customElements.whenDefined("sakuga-slider").then(inject);
  }
  initVolumeSliderBubble();

  const setVolumeMoving = (moving) => {
    if (moving) {
      volumeContainer?.classList.add("is-moving");
      volumeSlider?.classList.add("is-moving");
      window.clearTimeout(volumeMoveTimer);
      volumeMoveTimer = window.setTimeout(() => {
        volumeContainer?.classList.remove("is-moving");
        volumeSlider?.classList.remove("is-moving");
      }, 700);
    } else {
      window.clearTimeout(volumeMoveTimer);
      volumeMoveTimer = window.setTimeout(() => {
        volumeContainer?.classList.remove("is-moving");
        volumeSlider?.classList.remove("is-moving");
      }, 400);
    }
  };

  const onVolumeInput = (event) => {
    const rawVal = event.target.value ?? volumeSlider?.value ?? 15;
    const numVal = Math.round(Number(rawVal));
    player.volume = Math.min(1, Math.max(0, numVal / 100));
    savePlayer();
    if (volumePct) volumePct.textContent = `${numVal}%`;
    setVolumeMoving(true);
  };
  volumeSlider?.addEventListener("input", onVolumeInput);
  volumeSlider?.addEventListener("change", onVolumeInput);
  volumeSlider?.addEventListener("pointerdown", () => setVolumeMoving(true));
  volumeSlider?.addEventListener("pointerup", () => setVolumeMoving(false));

  /* pause the site music whenever a showcase video starts playing */
  let musicPausedForVideo = false;
  const pauseMusicForVideo = () => {
    if (musicPausedForVideo) return;
    musicPausedForVideo = true;
    try { player.pause(); } catch (error) { /* noop */ }
  };
  const resumeMusicAfterVideo = () => {
    if (!musicPausedForVideo) return;
    musicPausedForVideo = false;
    if (soundOn) {
      try {
        const result = player.play();
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch (error) { /* noop */ }
    }
  };
  document.addEventListener("play", (event) => {
    if (event.target && event.target.tagName === "VIDEO") pauseMusicForVideo();
  }, true);
  document.addEventListener("pause", (event) => {
    if (event.target && event.target.tagName === "VIDEO") resumeMusicAfterVideo();
  }, true);

  function initMusic() {
    player.volume = 0.15;
    updatePlayerUI();
    if (!musicTracks.length) return;
    player.src = encodeURI(musicTracks[0].src);
    play(); // auto-start; falls back to the first click/keypress if the browser says no
  }

  /* ============================================================
     ARCADE — Do Not Stop: Forest Run, embedded and self-contained
     ============================================================ */
  const gameDialog = $("#gameDialog");
  const gameIframe = $("#gameIframe");
  const gameLoading = $("[data-game-loading]");
  const gameWisteriaPilot = $("#gameWisteriaPilot");
  const gameWisteriaSprite = $("#gameWisteriaSprite");
  const gameWisteriaText = $("#gameWisteriaText");
  const gameBotToggle = $("#gameBotToggle");
  let gameFrameReady = false;
  let gameMusicWasOn = false;
  let pendingWisteriaBot = false;
  let pendingWisteriaMode = "story";
  let gameBotActive = false;

  function formatGameBest(value) {
    return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(6, "0");
  }

  function refreshArcadeBest() {
    let best = 0;
    try { best = parseInt(window.localStorage.getItem("doNotStopMomentumBest"), 10) || 0; } catch (error) { best = 0; }
    $$("[data-arcade-best]").forEach((el) => { el.textContent = formatGameBest(best); });
  }

  function setGameLoading(loading) {
    if (gameLoading) gameLoading.hidden = !loading;
  }

  function sendArcadeCmd(cmd) {
    if (!gameIframe || !gameIframe.contentWindow) return;
    try {
      gameIframe.contentWindow.postMessage({ type: "kurizu-arcade-cmd", ...cmd }, "*");
    } catch (error) { /* noop */ }
  }

  function updateGameWisteriaOverlay(active, text = "", mood = "idle") {
    gameBotActive = Boolean(active);
    if (gameBotToggle) {
      gameBotToggle.classList.toggle("is-active", gameBotActive);
      gameBotToggle.textContent = gameBotActive ? "🐾 take over controls" : "🐾 let Wisteria play";
    }
    if (!gameWisteriaPilot) return;
    gameWisteriaPilot.hidden = !gameBotActive;
    if (!gameBotActive) return;

    gameWisteriaPilot.classList.toggle("is-hyped", mood === "action" || mood === "talk");
    if (text && gameWisteriaText) gameWisteriaText.textContent = text;

    if (gameWisteriaSprite && config.pet && config.pet.moods) {
      const pool = config.pet.moods[mood] || config.pet.moods.action || config.pet.moods.idle || [];
      const src = pool[0];
      if (src) gameWisteriaSprite.src = encodeURI(String(src));
    }
  }

  function openGame() {
    if (!gameDialog) return;
    gameMusicWasOn = soundOn;
    if (soundOn) pause();
    // don't let a case-study video talk over the game
    document.querySelectorAll("video").forEach((video) => {
      if (!video.paused && !video.ended) {
        try { video.pause(); } catch (error) { /* noop */ }
      }
    });
    if (!gameFrameReady) {
      setGameLoading(true);
      gameIframe.src = "game/index.html";
      gameFrameReady = true;
    } else if (pendingWisteriaBot) {
      sendArcadeCmd({ action: "start-wisteria-bot", mode: pendingWisteriaMode });
      pendingWisteriaBot = false;
    }
    openDialog(gameDialog);
    window.setTimeout(() => {
      try { gameIframe.focus(); } catch (error) { /* noop */ }
    }, 300);
  }

  function openGameWithWisteria(mode = "story") {
    pendingWisteriaBot = true;
    pendingWisteriaMode = mode;
    updateGameWisteriaOverlay(true, "stretching my pixels... let's run!! 🐾✨", "action");
    openGame();
  }

  function stopGame() {
    if (!gameIframe) return;
    gameFrameReady = false;
    pendingWisteriaBot = false;
    updateGameWisteriaOverlay(false);
    gameIframe.src = "about:blank";
    setGameLoading(true);
    refreshArcadeBest();
  }

  if (gameIframe) {
    gameIframe.addEventListener("load", () => {
      if (!gameFrameReady) return;
      setGameLoading(false);
      try { gameIframe.focus(); } catch (error) { /* noop */ }
      if (pendingWisteriaBot) {
        window.setTimeout(() => {
          sendArcadeCmd({ action: "start-wisteria-bot", mode: pendingWisteriaMode });
          pendingWisteriaBot = false;
        }, 120);
      }
    });
  }

  if (gameDialog) {
    gameDialog.addEventListener("close", () => {
      if (document.fullscreenElement) {
        try {
          const result = document.exitFullscreen();
          if (result && typeof result.catch === "function") result.catch(() => {});
        } catch (error) { /* noop */ }
      }
      unlockScroll();
      stopGame();
      if (gameMusicWasOn) {
        gameMusicWasOn = false;
        play();
      }
    });
    gameDialog.addEventListener("click", (event) => {
      if (event.target === gameDialog) gameDialog.close();
    });
  }

  /* delegated so the play button inside case studies works too */
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-wisteria-play]")) {
      openGameWithWisteria("story");
      return;
    }
    if (event.target.closest("[data-play-game]")) openGame();
  });

  gameBotToggle?.addEventListener("click", () => {
    if (!gameFrameReady) {
      openGameWithWisteria("story");
      return;
    }
    sendArcadeCmd({ action: "toggle-wisteria-bot" });
    try { gameIframe.focus(); } catch (error) { /* noop */ }
  });

  $("#gameFullscreen")?.addEventListener("click", () => {
    if (!gameDialog) return;
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        return;
      }
      const target = gameDialog.querySelector(".game-modal__window") || gameDialog;
      const result = target.requestFullscreen();
      if (result && typeof result.catch === "function") {
        result.catch(() => toast("fullscreen isn't available here ♡"));
      }
    } catch (error) {
      toast("fullscreen isn't available here ♡");
    }
  });

  document.addEventListener("fullscreenchange", () => {
    const button = $("#gameFullscreen");
    if (button) button.setAttribute("aria-label", document.fullscreenElement ? "Exit fullscreen" : "Fullscreen");
  });

  window.addEventListener("message", (event) => {
    if (!gameIframe || event.source !== gameIframe.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== "kurizu-arcade") return;
    if (data.state === "playing" && soundOn) {
      gameMusicWasOn = true;
      pause();
    }
    if (typeof data.botActive === "boolean") {
      gameBotActive = data.botActive;
      if (gameBotToggle) {
        gameBotToggle.classList.toggle("is-active", gameBotActive);
        gameBotToggle.textContent = gameBotActive ? "🐾 take over controls" : "🐾 let Wisteria play";
      }
      if (!gameBotActive && data.event !== "gameover" && data.event !== "win") {
        updateGameWisteriaOverlay(false);
      }
    }
    if (data.event === "bot-start") {
      updateGameWisteriaOverlay(true, "okaay!! watch my footwork down the trail!! ⚡", "action");
    } else if (data.event === "coin-streak") {
      updateGameWisteriaOverlay(true, `FLOW ×${data.multiplier || 2}!! look at all these RAM coins!! ✨`, "headpat");
    } else if (data.event === "clean-clear") {
      updateGameWisteriaOverlay(true, "woohoo!! too clean!! 🐾", "action");
    } else if (data.event === "hit") {
      updateGameWisteriaOverlay(true, "waaah!! my paws slipped!! still running!! ><", "poke");
    } else if (data.event === "phase4") {
      updateGameWisteriaOverlay(true, "uh oh... Phase 4 dark woods... being super sneaky now! 👀", "talk");
    } else if (data.event === "spotted") {
      updateGameWisteriaOverlay(true, data.charging ? "EEP!! IT'S SPRINTING AT ME — HIDE!!" : "shhh! that monster almost saw me!!", "poke");
    } else if (data.event === "win") {
      updateGameWisteriaOverlay(true, `I ESCAPED THE FOREST!! score: ${formatGameBest(data.score)} ♡✨`, "headpat");
      petSay(`yay!! i escaped Into the Forest with ${data.score} pts!! ♡`, 4000);
    } else if (data.event === "gameover") {
      updateGameWisteriaOverlay(true, `oof!! got caught at ${data.distance || 0}m (${data.score || 0} pts)... rematch? :3`, "poke");
    } else if (data.event === "bot-takeover") {
      updateGameWisteriaOverlay(false);
      petSay("your turn human!! don't stop running!! ✨", 2800);
    }
    if (data.state === "gameover" || data.state === "menu") refreshArcadeBest();
  });

  /* ---- 3D Chess Easy-Mode Horror Easter Egg (Music Slowdown + Glitched Desktop Icons) ---- */
  let chessGlitchTimer = 0;
  const CHESS_GLITCH_LABELS = ["wisteria.exe", "DON'T_WIN", "ERR_0x666", "LOOK_BACK", "CHECKMATE", "???_VOID"];

  function setDesktopChessGlitch(active) {
    const on = Boolean(active);
    document.body.classList.toggle("is-chess-glitched", on);
    if (chessGlitchTimer) {
      window.clearInterval(chessGlitchTimer);
      chessGlitchTimer = 0;
    }
    const labels = $$(".desktop-icon__label");
    if (on) {
      labels.forEach((lbl) => {
        if (lbl.dataset.chessOrigLabel === undefined) {
          lbl.dataset.chessOrigLabel = lbl.textContent;
        }
      });
      const scrambleTick = () => {
        labels.forEach((lbl) => {
          if (lbl.dataset.chessOrigLabel !== undefined) {
            lbl.textContent = lbl.dataset.chessOrigLabel;
          }
        });
        const count = Math.min(2, labels.length);
        for (let i = 0; i < count; i++) {
          const idx = Math.floor(Math.random() * labels.length);
          const pick = labels[idx];
          if (pick) {
            pick.textContent = CHESS_GLITCH_LABELS[Math.floor(Math.random() * CHESS_GLITCH_LABELS.length)];
          }
        }
      };
      scrambleTick();
      chessGlitchTimer = window.setInterval(scrambleTick, 380);
    } else {
      labels.forEach((lbl) => {
        if (lbl.dataset.chessOrigLabel !== undefined) {
          lbl.textContent = lbl.dataset.chessOrigLabel;
          delete lbl.dataset.chessOrigLabel;
        }
      });
    }
  }

  function isChessWindowOpen() {
    const win = $("#chessWindow");
    return Boolean(win && !win.classList.contains("is-closed") && !win.classList.contains("is-minimized"));
  }

  function nudgePetOutsideChessWindow() {
    if (!petStage || !isChessWindowOpen()) return;
    const win = $("#chessWindow");
    if (!win) return;
    const wRect = win.getBoundingClientRect();
    const pRect = petStage.getBoundingClientRect();
    if (wRect.width < 10 || pRect.width < 10) return;

    const overlapsX = pRect.right > wRect.left + 8 && pRect.left < wRect.right - 8;
    const overlapsY = pRect.bottom > wRect.top + 8 && pRect.top < wRect.bottom - 8;
    if (!overlapsX || !overlapsY) return;

    const vw = window.innerWidth;
    const currentRightAnchor = pRect.left - petX;
    const leftSlotLeft = Math.max(8, wRect.left - pRect.width - 14);
    const rightSlotLeft = vw - pRect.width - 12;
    const targetLeft = leftSlotLeft + pRect.width <= wRect.left + 12 ? leftSlotLeft : rightSlotLeft;
    petX = Math.round(targetLeft - currentRightAnchor);
    petY = 0;
    petStage.style.transition = "transform 0.25s ease";
    petStage.style.transform = `translate3d(${petX}px, 0, 0)`;
    petChoiceActive = false;
    petBubble?.classList.remove("is-visible", "has-choice");
  }

  function clearChessEggEffects() {
    setDesktopChessGlitch(false);
    if (!document.body.classList.contains("is-wisteria-mad")) {
      applyPlayerPitchAndRate(1);
    }
    const urlInput = $("#chessUrlInput");
    if (urlInput) urlInput.value = "kurizu://games/wisteria-chess";
  }

  window.addEventListener("message", (event) => {
    const chessFrame = $("#chessIframe");
    if (!chessFrame || event.source !== chessFrame.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== "kurizu-chess-egg") return;
    if (typeof data.rate === "number" && !document.body.classList.contains("is-wisteria-mad")) {
      applyPlayerPitchAndRate(data.rate);
    }
    if (typeof data.glitchIcons === "boolean") {
      setDesktopChessGlitch(data.glitchIcons);
    }
    const urlInput = $("#chessUrlInput");
    if (urlInput) {
      if (data.stage === "snap-backrooms") {
        urlInput.value = data.realm === "level0"
          ? "kurizu://games/wisteria-chess-level0"
          : "kurizu://games/wisteria-chess-plains";
      } else if (data.stage === "caught-close-site") {
        triggerWebsiteShutdownByWisteria();
      } else if (data.stage === "pc-restart-reset") {
        triggerWebsiteResetByPcRestart();
      } else if (data.stage === "reset") {
        urlInput.value = "kurizu://games/wisteria-chess";
      }
    }
  });

  function playMetaverseBytebeat(durationSec) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const rate = 8000;
      const len = Math.floor(rate * durationSec);
      const buf = ctx.createBuffer(1, len, rate);
      const ch = buf.getChannelData(0);
      for (let t = 0; t < len; t++) {
        // Classic Metaverse/MEMZ bytebeat glitch melody
        const v = t < len * 0.45
          ? ((t * ((t >> 5) | (t >> 8))) >> (t >> 16)) & 255
          : ((t * 5 & (t >> 7)) | (t * 3 & (t >> 10))) & 255;
        ch[t] = (v / 127.5 - 1.0) * 0.65;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.11;
      src.connect(g);
      g.connect(ctx.destination);
      src.start();
      return {
        stop: () => {
          try { src.stop(); } catch (_) {}
          try { ctx.close(); } catch (_) {}
        },
      };
    } catch (_) {
      return null;
    }
  }

  function runMemzGlitchOverlay({ headerText, accentColor, durationMs, onComplete }) {
    try { bgAudio?.pause(); } catch (_) {}
    if ($("#metaverseGlitchCanvas") || $("#siteShutdownOverlay") || $("#siteRebootOverlay")) return;

    const cvs = document.createElement("canvas");
    cvs.id = "metaverseGlitchCanvas";
    const w = Math.max(320, Math.min(960, window.innerWidth));
    const h = Math.max(240, Math.min(600, window.innerHeight));
    cvs.width = w;
    cvs.height = h;
    cvs.style.cssText =
      "position:fixed;inset:0;z-index:999998;width:100vw;height:100vh;pointer-events:auto;image-rendering:pixelated;";
    document.body.appendChild(cvs);

    const g = cvs.getContext("2d");
    // Seed canvas with stylized snapshot of the desktop + live chess canvas so GDI feedback looks real
    g.fillStyle = "#160726";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(192,132,252,0.16)";
    for (let x = 0; x < w; x += 28) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    try {
      const iframeCvs = $("#chessIframe")?.contentDocument?.getElementById("chessCanvas");
      if (iframeCvs) {
        g.drawImage(iframeCvs, Math.floor(w * 0.18), Math.floor(h * 0.1), Math.floor(w * 0.74), Math.floor(h * 0.76));
      }
    } catch (_) {}
    g.fillStyle = accentColor || "#c084fc";
    g.font = "bold 22px monospace";
    g.fillText(headerText || "KURIZU.EXE // FATAL_ERR_0x000", 24, 38);

    const totalMs = durationMs || 2850;
    const bytebeat = playMetaverseBytebeat((totalMs + 250) / 1000);
    const startMs = performance.now();
    let rafId = 0;

    function drawCursor(cx, cy) {
      g.save();
      g.translate(cx, cy);
      g.fillStyle = "#ffffff";
      g.strokeStyle = "#000000";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 0); g.lineTo(0, 18); g.lineTo(5, 14); g.lineTo(9, 22); g.lineTo(12, 20); g.lineTo(8, 13); g.lineTo(14, 13);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }

    function tickGlitch(now) {
      const elapsed = now - startMs;
      if (elapsed >= totalMs) {
        cancelAnimationFrame(rafId);
        try { bytebeat?.stop(); } catch (_) {}
        cvs.remove();
        onComplete?.();
        return;
      }

      const p1 = totalMs * 0.33;
      const p2 = totalMs * 0.67;
      if (elapsed < p1) {
        // Phase 1: MEMZ zoom tunnel + PATINVERT flashes + cursor spam
        const inset = 12 + Math.floor(Math.random() * 14);
        const jx = Math.floor((Math.random() - 0.5) * 18);
        const jy = Math.floor((Math.random() - 0.5) * 18);
        g.drawImage(cvs, 0, 0, w, h, inset + jx, inset + jy, w - inset * 2, h - inset * 2);
        if (Math.random() < 0.35) {
          g.save();
          g.globalCompositeOperation = "difference";
          g.fillStyle = Math.random() < 0.5 ? "#ff2a6d" : (accentColor || "#c084fc");
          g.fillRect(0, 0, w, h);
          g.restore();
        }
        for (let i = 0; i < 6; i++) drawCursor(Math.random() * w, Math.random() * h);
      } else if (elapsed < p2) {
        // Phase 2: Screen melt dripping strips + rotated skew feedback + rainbow floods
        for (let i = 0; i < 16; i++) {
          const sx = Math.floor(Math.random() * w);
          const sw = 10 + Math.floor(Math.random() * 34);
          const drop = 8 + Math.floor(Math.random() * 28);
          g.drawImage(cvs, sx, 0, sw, h - drop, sx, drop, sw, h - drop);
        }
        g.save();
        g.translate(w * 0.5, h * 0.5);
        g.rotate((Math.random() - 0.5) * 0.08);
        g.drawImage(cvs, -w * 0.48, -h * 0.48, w * 0.96, h * 0.96);
        g.restore();
        if (Math.random() < 0.4) {
          g.save();
          g.globalCompositeOperation = "exclusion";
          g.fillStyle = `hsl(${Math.floor(Math.random() * 360)}, 95%, 55%)`;
          g.fillRect(0, Math.random() * h, w, 18 + Math.random() * 90);
          g.restore();
        }
      } else {
        // Phase 3: Bitwise Sierpinski / XOR RGB corruption (FenXingSanJiao style)
        const img = g.getImageData(0, 0, w, h);
        const d = img.data;
        const shift = (Math.floor(elapsed / 40) * 19) & 255;
        for (let y = 0; y < h; y += 2) {
          for (let x = 0; x < w; x += 2) {
            const idx = (y * w + x) * 4;
            const pat = ((x + shift) ^ (y + shift)) & 255;
            d[idx] = (d[idx] + pat) & 255;
            d[idx + 1] = (d[idx + 1] ^ (x | y)) & 255;
            d[idx + 2] = (d[idx + 2] + ((x & y) + shift)) & 255;
            d[idx + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        // Horizontal tear bands
        for (let k = 0; k < 5; k++) {
          const sy = Math.floor(Math.random() * h);
          const sh = 6 + Math.floor(Math.random() * 24);
          g.drawImage(cvs, 0, sy, w, sh, (Math.random() - 0.5) * 60, sy, w, sh);
        }
      }

      rafId = requestAnimationFrame(tickGlitch);
    }
    rafId = requestAnimationFrame(tickGlitch);
  }

  function triggerWebsiteShutdownByWisteria() {
    runMemzGlitchOverlay({
      headerText: "KURIZU.EXE // FATAL_ERR_0x000",
      accentColor: "#c084fc",
      durationMs: 2850,
      onComplete: showFinalShutdownOverlay,
    });
  }

  function triggerWebsiteResetByPcRestart() {
    try { window.localStorage.removeItem(PET_MAD_KEY); } catch (_) {}
    setDesktopChessGlitch(false);
    window.__pcRestartGlitchActive = true;
    runMemzGlitchOverlay({
      headerText: "KURIZU.EXE // SYSTEM_REBOOT_0x001",
      accentColor: "#34d399",
      durationMs: 2350,
      onComplete: showPcRebootAndReloadOverlay,
    });
  }

  function showPcRebootAndReloadOverlay() {
    if ($("#siteRebootOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "siteRebootOverlay";
    ov.style.cssText =
      "position:fixed;inset:0;z-index:999999;background:#020a09;display:grid;place-items:center;color:#a7f3d0;font-family:monospace;text-align:center;opacity:0;transition:opacity 0.18s ease;";
    ov.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px;">
        <div style="width:min(90vw,420px);height:2px;background:linear-gradient(90deg,transparent,#34d399,#fff,#34d399,transparent);box-shadow:0 0 24px #34d399;"></div>
        <div style="font-size:16px;letter-spacing:0.2em;color:#6ee7b7;font-weight:700;">SYSTEM RESTORED</div>
        <div style="font-size:12px;letter-spacing:0.1em;color:#a7f3d0;opacity:0.85;">rebooting kurizu.exe...</div>
      </div>
    `;
    document.body.appendChild(ov);
    requestAnimationFrame(() => {
      ov.style.opacity = "1";
    });
    window.__pcRestartReloadScheduled = true;
    setTimeout(() => {
      window.__pcRestartReloadCalled = true;
      if (!window.__preventReloadForTest) {
        window.location.reload();
      } else {
        window.__pcRestartGlitchActive = false;
        ov.remove();
        $("#chessWindow")?.classList.add("is-closed");
        const frame = $("#chessIframe");
        if (frame) frame.src = "about:blank";
        if ($("#chessUrlInput")) $("#chessUrlInput").value = "kurizu://games/wisteria-chess";
      }
    }, 350);
  }

  function showFinalShutdownOverlay() {
    if ($("#siteShutdownOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "siteShutdownOverlay";
    ov.style.cssText =
      "position:fixed;inset:0;z-index:999999;background:#030106;display:grid;place-items:center;color:#e9d5ff;font-family:monospace;text-align:center;opacity:0;transition:opacity 0.22s ease;";
    ov.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px;">
        <div style="width:min(90vw,420px);height:2px;background:linear-gradient(90deg,transparent,#ff2a6d,#fff,#ff2a6d,transparent);box-shadow:0 0 24px #ff2a6d;"></div>
        <div style="font-size:16px;letter-spacing:0.2em;color:#ff2a6d;font-weight:700;">CONNECTION TERMINATED</div>
        <div style="font-size:12px;letter-spacing:0.1em;color:#c084fc;opacity:0.8;">wisteria caught you in level 0.</div>
      </div>
    `;
    document.body.appendChild(ov);
    requestAnimationFrame(() => {
      ov.style.opacity = "1";
    });
    setTimeout(() => {
      try {
        window.open("", "_self");
        window.close();
      } catch (_) {}
    }, 550);
  }

  function submitChessUrlCommand() {
    const input = $("#chessUrlInput");
    const frame = $("#chessIframe");
    if (!input || !frame) return;
    const raw = input.value.trim().toLowerCase();
    input.blur();

    if (/level[-_\s]?0|lvl[-_\s]?0|lobby/.test(raw)) {
      input.value = "kurizu://games/wisteria-chess-level0";
      if (!frame.getAttribute("src") || frame.getAttribute("src") === "about:blank") {
        frame.src = "chess/index.html?windowed=1&egg=level0";
      } else {
        try {
          frame.contentWindow?.postMessage({ type: "kurizu-chess-cmd", action: "trigger-snap-level0" }, "*");
        } catch (_) {}
      }
      frame.focus();
    } else if (/plains|level[-_\s]?94|backrooms|snap/.test(raw)) {
      input.value = "kurizu://games/wisteria-chess-plains";
      if (!frame.getAttribute("src") || frame.getAttribute("src") === "about:blank") {
        frame.src = "chess/index.html?windowed=1&egg=plains";
      } else {
        try {
          frame.contentWindow?.postMessage({ type: "kurizu-chess-cmd", action: "trigger-snap-plains" }, "*");
        } catch (_) {}
      }
      frame.focus();
    } else if (/wisteria-chess|chess/.test(raw)) {
      input.value = "kurizu://games/wisteria-chess";
      if (!frame.getAttribute("src") || frame.getAttribute("src") === "about:blank") {
        frame.src = "chess/index.html?windowed=1";
      } else {
        try {
          frame.contentWindow?.postMessage({ type: "kurizu-chess-cmd", action: "reset-chess" }, "*");
        } catch (_) {}
      }
      frame.focus();
    }
  }

  $("#chessUrlForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submitChessUrlCommand();
  });

  $("#chessUrlInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      submitChessUrlCommand();
    }
  });

  $("#chessUrlInput")?.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
  });

  refreshArcadeBest();

  /* ============================================================
     CLOCK, YEAR, COPY, AVAILABILITY
     ============================================================ */
  let timeFormatter = null;
  try {
    timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: config.timezone || "Asia/Manila",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch (error) {
    timeFormatter = null;
  }

  function tickClock() {
    let value = "--:--";
    try {
      value = timeFormatter
        ? timeFormatter.format(new Date())
        : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (error) { /* noop */ }
    $$("[data-clock]").forEach((el) => { el.textContent = value; });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      let worked = false;
      try { worked = document.execCommand("copy"); } catch (copyError) { worked = false; }
      area.remove();
      return worked;
    }
  }

  function wireCopy() {
    const button = $("[data-copy-website]");
    if (!button) return;
    button.addEventListener("click", async () => {
      const worked = await copyText(config.website.url);
      toast(worked ? "website link copied ♡" : `copy failed — ${config.website.url}`);
      if (worked) {
        const original = button.innerHTML;
        button.innerHTML = icon("check");
        window.setTimeout(() => { button.innerHTML = original; }, 1400);
      }
    });
  }

  /* ============================================================
     REVEAL, CURSOR HEARTS, SCROLLSPY
     ============================================================ */
  function initReveal() {
    const elements = $$("[data-reveal]");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    document.documentElement.classList.add("js-reveal");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });

    elements.forEach((el) => observer.observe(el));
  }

  function initCustomCursor() {
    const cursor = $("#customCursor");
    if (!cursor || !finePointer || reduceMotion) return;

    document.documentElement.classList.add("has-custom-cursor");

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let visible = false;
    let loading = true;
    const buffering = new Set();

    function place() {
      cursor.style.transform = `translate3d(${Math.round(x - 16)}px, ${Math.round(y - 16)}px, 0)`;
    }

    function refresh() {
      document.body.classList.toggle("is-busy", loading || buffering.size > 0);
    }

    document.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      x = event.clientX;
      y = event.clientY;
      place();
      if (!visible) {
        visible = true;
        cursor.classList.add("is-visible");
      }
    }, { passive: true });

    document.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse") return;
      cursor.classList.add("is-down");
    });
    document.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "mouse") return;
      cursor.classList.remove("is-down");
    });
    document.addEventListener("mouseleave", () => {
      visible = false;
      cursor.classList.remove("is-visible");
    });
    window.addEventListener("blur", () => {
      visible = false;
      cursor.classList.remove("is-visible");
    });

    /* wait.gif while the page loads or a video buffers */
    refresh();
    window.addEventListener("load", () => {
      loading = false;
      refresh();
    });
    document.addEventListener("waiting", (event) => {
      if (event.target && event.target.tagName === "VIDEO") {
        buffering.add(event.target);
        refresh();
      }
    }, true);
    ["playing", "canplay", "pause", "error", "ended"].forEach((type) => {
      document.addEventListener(type, (event) => {
        if (event.target && event.target.tagName === "VIDEO" && buffering.delete(event.target)) refresh();
      }, true);
    });
  }

  function initCursorHearts() {
    if (!finePointer || reduceMotion) return;
    const layer = $("#cursorHearts");
    if (!layer) return;
    let last = 0;

    document.addEventListener("pointermove", (event) => {
      const now = performance.now();
      if (now - last < 85) return;
      last = now;
      if (Math.random() < 0.45) return;
      if (layer.childElementCount > 14) layer.firstElementChild?.remove();

      const heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      heart.setAttribute("class", "heart-particle");
      heart.setAttribute("viewBox", "0 0 12 11");
      heart.style.left = `${event.clientX + (Math.random() * 10 - 5)}px`;
      heart.style.top = `${event.clientY + (Math.random() * 10 - 5)}px`;
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#i-heart");
      heart.appendChild(use);
      layer.appendChild(heart);
      window.setTimeout(() => heart.remove(), 950);
    }, { passive: true });
  }

  function initScrollSpy() {
    const links = $$(".mainnav a");
    const sections = ["about", "work", "arcade", "media", "contact"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    if (!links.length || !sections.length || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const hash = `#${entry.target.id}`;
        links.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === hash));
      });
    }, { rootMargin: "-42% 0px -52% 0px", threshold: 0 });

    sections.forEach((section) => observer.observe(section));

    window.addEventListener("scroll", () => {
      if (window.scrollY < 220) links.forEach((link) => link.classList.remove("is-active"));
    }, { passive: true });
  }

  /* ============================================================
     INIT
     ============================================================ */
  renderSocials();
  renderWebsiteLinks();
  renderKofiLinks();
  renderContactActions();
  renderAvailability();
  renderCategories();
  renderProjects();
  initCardTilt();
  renderFeaturedMini();
  renderVideoLinks();
  renderGalleryFilters();
  renderGallery();
  syncAutoGallery();
  wireProjectOpeners();
  buildReel();
  wireCopy();
  setView("grid");

  $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });
  tickClock();
  window.setInterval(tickClock, 15000);

  initReveal();
  initCustomCursor();
  initCursorHearts();
  initScrollSpy();
  initMusic();
  initSfx();

  $("#backToTop")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  });

  /* ============================================================
     HEART CONFETTI BURST + LIVE COUNTER
     ============================================================ */
  let heartLikes = 142;
  try {
    const savedLikes = parseInt(window.localStorage.getItem("kurizu.hearts"), 10);
    if (!Number.isNaN(savedLikes) && savedLikes > 0) heartLikes = savedLikes;
  } catch (_) {}

  function spawnHeartShower(originX, originY, count = 16) {
    const layer = $("#cursorHearts");
    if (!layer) return;
    const cx = originX ?? window.innerWidth / 2;
    const cy = originY ?? window.innerHeight / 2;
    for (let i = 0; i < count; i++) {
      const heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      heart.setAttribute("class", "heart-particle heart-particle--burst");
      heart.setAttribute("viewBox", "0 0 12 11");
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
      const dist = 35 + Math.random() * 90;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 30;
      heart.style.left = `${cx}px`;
      heart.style.top = `${cy}px`;
      heart.style.setProperty("--dx", `${dx.toFixed(1)}px`);
      heart.style.setProperty("--dy", `${dy.toFixed(1)}px`);
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", i % 3 === 0 ? "#i-star" : "#i-heart");
      heart.appendChild(use);
      layer.appendChild(heart);
      window.setTimeout(() => heart.remove(), 1000);
    }
  }

  function spawnHeartRain(count = 38) {
    const layer = $("#cursorHearts");
    if (!layer) return;
    const palette = ["#ff5ea8", "#ff8fd8", "#c084fc", "#ffd166", "#f472b6", "#a855f7"];
    for (let i = 0; i < count; i++) {
      const heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      heart.setAttribute("class", "heart-particle heart-particle--rain");
      heart.setAttribute("viewBox", "0 0 12 11");
      const dur = 1.8 + Math.random() * 1.4;
      const delay = Math.random() * 0.9;
      const drift = (Math.random() - 0.5) * 140;
      const spin = (Math.random() < 0.5 ? -1 : 1) * (140 + Math.random() * 240);
      heart.style.left = `${(Math.random() * 96 + 2).toFixed(1)}vw`;
      heart.style.top = `0px`;
      heart.style.color = palette[i % palette.length];
      heart.style.setProperty("--dur", `${dur.toFixed(2)}s`);
      heart.style.setProperty("--delay", `${delay.toFixed(2)}s`);
      heart.style.setProperty("--drift", `${drift.toFixed(0)}px`);
      heart.style.setProperty("--spin", `${spin.toFixed(0)}deg`);
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", i % 4 === 0 ? "#i-star" : "#i-heart");
      heart.appendChild(use);
      layer.appendChild(heart);
      window.setTimeout(() => heart.remove(), Math.ceil((dur + delay + 0.2) * 1000));
    }
  }

  function initHeartCounter() {
    const countEl = $("#browserHeartCount");
    const heartBtn = $("#browserHeartBtn");
    const urlHeartBtn = $("#browserUrlHeartBtn");
    if (countEl) countEl.textContent = String(heartLikes);

    const addHeart = (e) => {
      heartLikes += 1;
      try { window.localStorage.setItem("kurizu.hearts", String(heartLikes)); } catch (_) {}
      if (countEl) countEl.textContent = String(heartLikes);
      playSfx("coin");
      const rect = e.currentTarget.getBoundingClientRect();
      spawnHeartShower(rect.left + rect.width / 2, rect.top + rect.height / 2, 14);
      heartBtn?.classList.remove("is-pulsing");
      void heartBtn?.offsetWidth;
      heartBtn?.classList.add("is-pulsing");
      if (heartLikes % 10 === 0) {
        toast(`woah, ${heartLikes} hearts sent! wisteria loves you ♡`);
      }
    };

    heartBtn?.addEventListener("click", addHeart);
    urlHeartBtn?.addEventListener("click", addHeart);
  }
  initHeartCounter();

  /* ============================================================
     HERO BROWSER TABS & DRAGGABLE FLOATING WINDOWS
     ============================================================ */
  const draggableOffsets = new Map();
  let topZ = 15;

  function resetAllDraggableWindows() {
    $$("[data-draggable]").forEach((win) => {
      win.style.transform = "";
      win.style.zIndex = "";
      win.classList.remove("is-dragged");
    });
    draggableOffsets.clear();
    playSfx("pop");
    toast("desktop windows tidied up ✨");
  }

  function initDraggableWindows() {
    $$("[data-draggable]").forEach((win) => {
      if (win.dataset.dragBound === "1") return;
      win.dataset.dragBound = "1";
      const handle = $("[data-drag-handle]", win) || win;
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let baseX = 0;
      let baseY = 0;

      handle.addEventListener("pointerdown", (e) => {
        if (window.innerWidth <= 860) return; // keep stacked layout clean on mobile
        if (e.target.closest("button, a, input, sakuga-slider, sakuga-button")) return;
        dragging = true;
        topZ += 1;
        win.style.zIndex = String(topZ);
        win.classList.add("is-dragging", "is-dragged");
        const cur = draggableOffsets.get(win) || { x: 0, y: 0 };
        baseX = cur.x;
        baseY = cur.y;
        startX = e.clientX;
        startY = e.clientY;
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      });

      handle.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const nx = baseX + (e.clientX - startX);
        const ny = baseY + (e.clientY - startY);
        draggableOffsets.set(win, { x: nx, y: ny });
        win.style.transform = `translate3d(${Math.round(nx)}px, ${Math.round(ny)}px, 0)`;
      });

      const stopDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        win.classList.remove("is-dragging");
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      handle.addEventListener("pointerup", stopDrag);
      handle.addEventListener("pointercancel", stopDrag);

      handle.addEventListener("dblclick", (e) => {
        if (e.target.closest("button, a, input")) return;
        draggableOffsets.delete(win);
        win.style.transform = "";
        win.classList.remove("is-dragged");
        playSfx("pop");
      });
    });
  }
  initDraggableWindows();

  function initHeroBrowser() {
    const tabsWrap = $("#browserTabs");
    const urlText = $("#browserUrlText");
    const catTab = $("#browserCatTab");
    const plusBtn = $("#browserPlusBtn");
    const backBtn = $("#browserBackBtn");
    const fwdBtn = $("#browserForwardBtn");
    const refreshBtn = $("#browserRefreshBtn");
    const restoreTabsBtn = $("#browserRestoreTabsBtn");
    if (!tabsWrap) return;

    const tabOrder = ["home", "apps", "secret", "cat"];
    const tabUrls = {
      home: "https://kurizu.exe",
      apps: "kurizu://desktop/my-apps",
      secret: "kurizu://new-tab/workbench",
      cat: "kurizu://secret/wisteria_dance.webp",
      empty: "kurizu://no-tabs-open",
    };
    let currentTab = "home";

    function getOpenTabs() {
      return tabOrder.filter((id) => {
        const el = tabsWrap.querySelector(`.browser__tab[data-tab="${id}"]`);
        return el && !el.hidden;
      });
    }

    function switchBrowserTab(tabId) {
      const targetBtn = tabsWrap.querySelector(`.browser__tab[data-tab="${tabId}"]`);
      if (targetBtn && targetBtn.hidden) targetBtn.hidden = false;
      currentTab = tabId;

      $$(".browser__tab", tabsWrap).forEach((t) => {
        const active = t.dataset.tab === tabId && !t.hidden;
        t.classList.toggle("is-active", active);
        t.classList.toggle("browser__tab--ghost", !active);
      });

      $$("[data-tab-pane]").forEach((pane) => {
        const active = pane.dataset.tabPane === tabId;
        pane.hidden = !active;
        pane.classList.toggle("is-active", active);
      });

      if (urlText && tabUrls[tabId]) {
        urlText.textContent = tabUrls[tabId];
      }
      playSfx("pop");
    }

    function closeBrowserTab(tabId) {
      const tabBtn = tabsWrap.querySelector(`.browser__tab[data-tab="${tabId}"]`);
      if (!tabBtn) return;
      tabBtn.hidden = true;
      tabBtn.classList.remove("is-active");
      const remaining = getOpenTabs();
      if (remaining.length > 0) {
        if (currentTab === tabId) {
          switchBrowserTab(remaining[0]);
        } else {
          playSfx("pop");
        }
        toast(`closed tab "${tabId}" — click + to reopen ✨`);
      } else {
        switchBrowserTab("empty");
        toast("all tabs closed! click + to reopen");
      }
    }

    function restoreClosedTab() {
      const closed = tabOrder.find((id) => {
        const el = tabsWrap.querySelector(`.browser__tab[data-tab="${id}"]`);
        return el && el.hidden;
      });
      if (closed) {
        const el = tabsWrap.querySelector(`.browser__tab[data-tab="${closed}"]`);
        if (el) el.hidden = false;
        switchBrowserTab(closed);
        if (closed === "cat") toast("secret tab unlocked: wisteria_dance.webp ♪");
        else toast(`reopened ${closed} tab ✨`);
      } else {
        const open = getOpenTabs();
        const idx = open.indexOf(currentTab);
        switchBrowserTab(open[(idx + 1) % open.length]);
      }
    }

    tabsWrap.addEventListener("click", (e) => {
      const closeBtn = e.target.closest("[data-close-tab]");
      if (closeBtn) {
        e.stopPropagation();
        closeBrowserTab(closeBtn.dataset.closeTab);
        return;
      }
      const tab = e.target.closest(".browser__tab[data-tab]");
      if (!tab) return;
      switchBrowserTab(tab.dataset.tab);
    });

    tabsWrap.addEventListener("keydown", (e) => {
      const closeBtn = e.target.closest("[data-close-tab]");
      if (closeBtn && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        e.stopPropagation();
        closeBrowserTab(closeBtn.dataset.closeTab);
      }
    });

    plusBtn?.addEventListener("click", () => {
      restoreClosedTab();
    });

    restoreTabsBtn?.addEventListener("click", () => {
      ["home", "apps", "secret"].forEach((id) => {
        const el = tabsWrap.querySelector(`.browser__tab[data-tab="${id}"]`);
        if (el) el.hidden = false;
      });
      switchBrowserTab("home");
      toast("default browser tabs restored ✨");
    });

    backBtn?.addEventListener("click", () => {
      const visibleTabs = getOpenTabs();
      if (!visibleTabs.length) return;
      const idx = Math.max(0, visibleTabs.indexOf(currentTab));
      switchBrowserTab(visibleTabs[(idx - 1 + visibleTabs.length) % visibleTabs.length]);
    });

    fwdBtn?.addEventListener("click", () => {
      const visibleTabs = getOpenTabs();
      if (!visibleTabs.length) return;
      const idx = Math.max(0, visibleTabs.indexOf(currentTab));
      switchBrowserTab(visibleTabs[(idx + 1) % visibleTabs.length]);
    });

    refreshBtn?.addEventListener("click", () => {
      const body = $("#browserBody");
      if (body) {
        body.classList.remove("is-refreshing");
        void body.offsetWidth;
        body.classList.add("is-refreshing");
      }
      playSfx("powerup");
      toast("refreshed kurizu.exe — 100% purple ✨");
    });

    // Lab actions inside secret tabs
    $("#browserBody")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lab-action]");
      if (!btn) return;
      const act = btn.dataset.labAction;
      if (act === "feed") {
        feedPet();
      } else if (act === "terminal") {
        restoreWindowById("about");
        $("#about")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        window.setTimeout(() => $("#terminalInput")?.focus(), 450);
      } else if (act === "party") {
        togglePartyMode();
      } else if (act === "arcade") {
        openGame();
      } else if (act === "sound") {
        playSfx("powerup", true);
        toast("♪ 8-bit chiptune powerup! ♪");
      } else if (act === "reset-win") {
        restoreAllDesktopWindows();
      } else if (act === "heart-shower") {
        const r = btn.getBoundingClientRect();
        playSfx("coin", true);
        spawnHeartShower(r.left + r.width / 2, r.top + r.height / 2, 18);
        spawnHeartRain(38);
        toast("♥ raining hearts! ♥");
      }
    });
  }
  initHeroBrowser();

  /* ============================================================
     WINDOWS-STYLE DESKTOP OS: ICONS, FLOATING WINDOWS, TASKBAR & START SEARCH
     ============================================================ */
  const APP_EXTENSIONS = {
    wisp: { file: "wisp.exe", ext: ".EXE", color: "#c084fc" },
    aipet: { file: "AIPet.exe", ext: ".EXE", color: "#a855f7" },
    pixify: { file: "pixify.app", ext: ".WEB", color: "#ec4899" },
    wobble: { file: "wobble.app", ext: ".WEB", color: "#f59e0b" },
    malfoy: { file: "malfoy.exe", ext: ".EXE", color: "#ef4444" },
    "forest-run": { file: "forest_run.exe", ext: ".GAME", color: "#10b981" },
    "ai-blocker": { file: "ai_blocker.crx", ext: ".CRX", color: "#3b82f6" },
    "dns-changer": { file: "dns_ph.apk", ext: ".APK", color: "#06b6d4" },
    lanshare: { file: "kurizu.dropship", ext: ".APP", color: "#8b5cf6" },
    firesword: { file: "firesword.mc", ext: ".MOD", color: "#f97316" },
  };

  /* Bespoke vector/pixel app icons for all desktop shortcuts (no photo thumbnails) */
  const CUSTOM_APP_ICONS = {
    "win-launchpad": {
      bg: "linear-gradient(145deg, #6d28d9, #2e1065)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M5 12a3 3 0 0 1 3-3h11l3 4h18a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V12Z" fill="#c084fc" stroke="#1e0936" stroke-width="2.5"/>
        <rect x="9" y="13" width="11" height="10" rx="2" fill="#bef264" stroke="#1e0936" stroke-width="2"/>
        <rect x="19" y="11" width="11" height="11" rx="2" fill="#ff5ea8" stroke="#1e0936" stroke-width="2"/>
        <rect x="28" y="13" width="11" height="10" rx="2" fill="#38bdf8" stroke="#1e0936" stroke-width="2"/>
        <path d="M5 20h38v16a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V20Z" fill="#a855f7" stroke="#1e0936" stroke-width="2.5"/>
        <rect x="15" y="25" width="5" height="5" rx="1" fill="#fde047" stroke="#1e0936" stroke-width="1.5"/>
        <rect x="22" y="25" width="5" height="5" rx="1" fill="#bef264" stroke="#1e0936" stroke-width="1.5"/>
        <rect x="29" y="25" width="5" height="5" rx="1" fill="#ff8fd8" stroke="#1e0936" stroke-width="1.5"/>
      </svg>`,
    },
    "win-work": {
      bg: "linear-gradient(145deg, #4c1d95, #2e1065)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M6 13a3 3 0 0 1 3-3h10l3 4h17a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V13Z" fill="#fbbf24" stroke="#1e0936" stroke-width="2.5"/>
        <rect x="10" y="15" width="28" height="14" rx="2" fill="#fef3c7" stroke="#1e0936" stroke-width="2"/>
        <path d="M6 20h36v15a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V20Z" fill="#f59e0b" stroke="#1e0936" stroke-width="2.5"/>
        <path d="m19 25-3 3.5 3 3.5M29 25l3 3.5-3 3.5M25.5 24l-3 9" stroke="#1e0936" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    "win-gallery": {
      bg: "linear-gradient(145deg, #831843, #500724)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M24 8C14.6 8 7 15 7 23.6 7 32.2 14.3 39 23 39c2.7 0 4.5-1.9 4.5-4.1 0-1.1-.5-2-.5-3 0-1.6 1.3-2.9 3-2.9h3.4c4.3 0 7.6-3.4 7.6-7.8C41 13.7 33.4 8 24 8Z" fill="#fde68a" stroke="#1e0936" stroke-width="2.5"/>
        <circle cx="15.5" cy="20" r="2.8" fill="#ff5ea8" stroke="#1e0936" stroke-width="1.6"/>
        <circle cx="22" cy="15" r="2.8" fill="#38bdf8" stroke="#1e0936" stroke-width="1.6"/>
        <circle cx="29.5" cy="16.5" r="2.8" fill="#a855f7" stroke="#1e0936" stroke-width="1.6"/>
        <circle cx="33.5" cy="22.5" r="2.5" fill="#4ade80" stroke="#1e0936" stroke-width="1.6"/>
        <circle cx="16.5" cy="28" r="2.5" fill="#fb923c" stroke="#1e0936" stroke-width="1.6"/>
        <circle cx="22.5" cy="33" r="2.4" fill="#831843" stroke="#1e0936" stroke-width="1.6"/>
      </svg>`,
    },
    "win-kurizu3d": {
      bg: "linear-gradient(145deg, #701a75, #3b0764)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M24 7 39 15.5v17L24 41 9 32.5v-17L24 7Z" fill="#e879f9" stroke="#1e0936" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M24 7 39 15.5 24 24 9 15.5 24 7Z" fill="#f5d0fe" stroke="#1e0936" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M24 24v17L9 32.5v-17L24 24Z" fill="#d946ef" stroke="#1e0936" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M24 24 39 15.5v17L24 41V24Z" fill="#a21caf" stroke="#1e0936" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="24" cy="24" r="2.6" fill="#bef264" stroke="#1e0936" stroke-width="1.6"/>
      </svg>`,
    },
    "win-about": {
      bg: "linear-gradient(145deg, #065f46, #064e3b)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M11 8h19l8 8v24a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" fill="#fef9c3" stroke="#1e0936" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M30 8v8h8" fill="#fde047" stroke="#1e0936" stroke-width="2.2" stroke-linejoin="round"/>
        <rect x="13" y="18" width="13" height="8" rx="2" fill="#1e0936"/>
        <path d="m15.5 20.5 2.2 1.7-2.2 1.8M19.5 24h3" stroke="#4ade80" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M14 31h20M14 35.5h14" stroke="#1e0936" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`,
    },
    "win-reel": {
      bg: "linear-gradient(145deg, #9d174d, #4c0519)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="7" y="17" width="34" height="23" rx="3" fill="#311042" stroke="#1e0936" stroke-width="2.5"/>
        <path d="M7 11a2 2 0 0 1 2-2h30a2 2 0 0 1 2 2v6H7v-6Z" fill="#f472b6" stroke="#1e0936" stroke-width="2.5"/>
        <path d="m13 9 4 8M23 9l4 8M33 9l4 8" stroke="#1e0936" stroke-width="2.5"/>
        <path d="m20 23 11 5.5L20 34V23Z" fill="#bef264" stroke="#1e0936" stroke-width="2.2" stroke-linejoin="round"/>
      </svg>`,
    },
    "win-contact": {
      bg: "linear-gradient(145deg, #155e75, #083344)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="6" y="13" width="36" height="24" rx="3" fill="#e0f2fe" stroke="#1e0936" stroke-width="2.5"/>
        <path d="m7 14 17 13L41 14" fill="#7dd3fc"/>
        <path d="m7 14 17 13L41 14" stroke="#1e0936" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M24 22.5c-1.8-2-4.8-1.5-4.8 1.2 0 2.5 4.8 5.3 4.8 5.3s4.8-2.8 4.8-5.3c0-2.7-3-3.2-4.8-1.2Z" fill="#ff5ea8" stroke="#1e0936" stroke-width="1.8"/>
      </svg>`,
    },
    "win-browser": {
      bg: "linear-gradient(145deg, #6d28d9, #3b0764)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="6" y="9" width="36" height="30" rx="4" fill="#f3e8ff" stroke="#1e0936" stroke-width="2.5"/>
        <path d="M6 13a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v4H6v-4Z" fill="#c084fc" stroke="#1e0936" stroke-width="2.5"/>
        <circle cx="11" cy="13" r="1.5" fill="#ff5ea8"/>
        <circle cx="15.5" cy="13" r="1.5" fill="#fbbf24"/>
        <circle cx="20" cy="13" r="1.5" fill="#4ade80"/>
        <circle cx="24" cy="28" r="8" fill="#a855f7" stroke="#1e0936" stroke-width="2.2"/>
        <ellipse cx="24" cy="28" rx="3.8" ry="8" stroke="#fef08a" stroke-width="1.8"/>
        <path d="M16.5 28h15" stroke="#fef08a" stroke-width="1.8"/>
      </svg>`,
    },
    "win-profile": {
      bg: "linear-gradient(145deg, #b45309, #451a03)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="7" y="10" width="34" height="28" rx="4" fill="#fef3c7" stroke="#1e0936" stroke-width="2.5"/>
        <path d="M7 14a4 4 0 0 1 4-4h26a4 4 0 0 1 4 4v4H7v-4Z" fill="#f59e0b" stroke="#1e0936" stroke-width="2.5"/>
        <circle cx="17" cy="26" r="4.2" fill="#c084fc" stroke="#1e0936" stroke-width="2"/>
        <path d="M11.5 34.5c1-3 3-4.2 5.5-4.2s4.5 1.2 5.5 4.2" fill="#c084fc" stroke="#1e0936" stroke-width="2" stroke-linecap="round"/>
        <path d="M26 24h10M26 28.5h7" stroke="#1e0936" stroke-width="2.3" stroke-linecap="round"/>
        <circle cx="34.5" cy="32.5" r="4" fill="#bef264" stroke="#1e0936" stroke-width="1.8"/>
        <path d="m32.8 32.5 1.2 1.3 2.4-2.4" stroke="#1e0936" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    wisp: {
      bg: "linear-gradient(145deg, #7a3bc4, #2f0a44)",
      img: "assets/images/wisp-icon.svg",
    },
    aipet: {
      bg: "linear-gradient(145deg, #7e22ce, #3b0764)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="m11 20 2-11 8 6h6l8-6 2 11v14a6 6 0 0 1-6 6H17a6 6 0 0 1-6-6V20Z" fill="#d8b4fe" stroke="#1e0936" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="m14 17 1-5 4 3M34 17l-1-5-4 3" fill="#ff8fd8"/>
        <circle cx="18.5" cy="26" r="2.2" fill="#1e0936"/>
        <circle cx="29.5" cy="26" r="2.2" fill="#1e0936"/>
        <ellipse cx="15" cy="29" rx="2" ry="1.2" fill="#ff5ea8"/>
        <ellipse cx="33" cy="29" rx="2" ry="1.2" fill="#ff5ea8"/>
        <path d="M21 29.5c1 1.4 2 1.4 3 0 1 1.4 2 1.4 3 0" stroke="#1e0936" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    pixify: {
      bg: "linear-gradient(145deg, #86198f, #3b0764)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="8" y="14" width="10" height="10" fill="#ff5ea8" stroke="#1e0936" stroke-width="2.2"/>
        <rect x="18" y="14" width="10" height="10" fill="#c084fc" stroke="#1e0936" stroke-width="2.2"/>
        <rect x="8" y="24" width="10" height="10" fill="#38bdf8" stroke="#1e0936" stroke-width="2.2"/>
        <rect x="18" y="24" width="10" height="10" fill="#fde047" stroke="#1e0936" stroke-width="2.2"/>
        <path d="m24 28 14-14 3 3-14 14-3-3Z" fill="#bef264" stroke="#1e0936" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M37 8v5M34.5 10.5h5" stroke="#fde047" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`,
    },
    wobble: {
      bg: "linear-gradient(145deg, #9a3412, #431407)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="7" y="9" width="34" height="30" rx="5" fill="#1e1b4b" stroke="#1e0936" stroke-width="2.5"/>
        <path d="M11 24c3-9 6-9 9 0s6 9 9 0 5-9 8 0" stroke="#bef264" stroke-width="3" stroke-linecap="round"/>
        <path d="M11 29c3-6 6-6 9 0s6 6 9 0 5-6 8 0" stroke="#ff5ea8" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="20" cy="14" r="2.2" fill="#fbbf24"/>
        <circle cx="28" cy="14" r="2.2" fill="#38bdf8"/>
      </svg>`,
    },
    malfoy: {
      bg: "linear-gradient(145deg, #2b4c3f, #181028)",
      img: "assets/images/malfoid-icon.png",
    },
    "forest-run": {
      bg: "linear-gradient(145deg, #065f46, #1e1b4b)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="m17 9 9 12h-5l6 10H11l6-10h-5l5-12Z" fill="#34d399" stroke="#1e0936" stroke-width="2.3" stroke-linejoin="round"/>
        <path d="m31 12 8 11h-4l5 9H24l5-9h-4l6-11Z" fill="#10b981" stroke="#1e0936" stroke-width="2.3" stroke-linejoin="round"/>
        <rect x="13" y="27" width="22" height="12" rx="6" fill="#c084fc" stroke="#1e0936" stroke-width="2.4"/>
        <path d="M19 31v4M17 33h4" stroke="#1e0936" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="28" cy="32" r="1.5" fill="#fde047"/>
        <circle cx="31" cy="34" r="1.5" fill="#ff5ea8"/>
      </svg>`,
    },
    "ai-blocker": {
      bg: "linear-gradient(145deg, #991b1b, #450a0a)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M24 7 38 12v11c0 9.5-6 16-14 19-8-3-14-9.5-14-19V12L24 7Z" fill="#ef4444" stroke="#1e0936" stroke-width="2.5" stroke-linejoin="round"/>
        <rect x="16" y="17" width="16" height="13" rx="3" fill="#fef2f2" stroke="#1e0936" stroke-width="2.2"/>
        <circle cx="21" cy="23.5" r="1.8" fill="#1e0936"/>
        <circle cx="27" cy="23.5" r="1.8" fill="#1e0936"/>
        <path d="m14 33 20-19" stroke="#fde047" stroke-width="3.4" stroke-linecap="round"/>
      </svg>`,
    },
    "dns-changer": {
      bg: "linear-gradient(145deg, #0369a1, #1e1b4b)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="15" fill="#38bdf8" stroke="#1e0936" stroke-width="2.5"/>
        <ellipse cx="24" cy="24" rx="7" ry="15" stroke="#1e0936" stroke-width="2"/>
        <path d="M9 24h30" stroke="#1e0936" stroke-width="2"/>
        <path d="m26 11-9 14h7l-2 12 11-15h-7l2-11Z" fill="#fde047" stroke="#1e0936" stroke-width="2.2" stroke-linejoin="round"/>
      </svg>`,
    },
    lanshare: {
      bg: "linear-gradient(160deg, #ffb0d6, #ff99c8)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M15 5H33V22H42L24 44L6 22H15V5Z" fill="#340542" stroke="#0d0214" stroke-width="2" stroke-linejoin="round"/>
        <path d="M18 8H30V25H36.5L24 40L11.5 25H18V8Z" fill="#9d3fa8" stroke="#0d0214" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>`,
    },
    firesword: {
      bg: "linear-gradient(145deg, #9a3412, #311042)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M28 9c3 4-1 7 2 10 3-2 5-6 5-6 3 5 1 11-3 15-4 4-11 4-15 0-4-4-3-11 2-15 0 0 0 4 3 4 1-3 3-6 6-8Z" fill="#fb923c"/>
        <path d="m35 10 3 3-17 17-3-3L35 10Z" fill="#fde047" stroke="#1e0936" stroke-width="2.3" stroke-linejoin="round"/>
        <path d="m13 25 10 10M15 33l-5 5" stroke="#1e0936" stroke-width="3" stroke-linecap="round"/>
        <circle cx="10" cy="38" r="2.5" fill="#ef4444" stroke="#1e0936" stroke-width="1.8"/>
      </svg>`,
    },
    "win-chess": {
      bg: "linear-gradient(145deg, #c084fc, #4c1d95)",
      svg: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <rect x="8" y="34" width="32" height="6" rx="2.5" fill="#fde047" stroke="#1e0936" stroke-width="2.3"/>
        <path d="M15 34c1-6 4-10 6-14-3 1-6 0-7-3 0-4 4-8 10-9l2-3 4 3c4 2 6 6 6 11 0 6-3 10-3 15H15Z" fill="#f5f3ff" stroke="#1e0936" stroke-width="2.4" stroke-linejoin="round"/>
        <circle cx="20.5" cy="14" r="1.7" fill="#1e0936"/>
      </svg>`,
    },
  };

  function getCustomAppIcon(id) {
    return CUSTOM_APP_ICONS[id] || CUSTOM_APP_ICONS["win-work"];
  }

  function getDesktopShortcutItems() {
    const projectList = config.projects || [];
    const projectCount = projectList.length;
    const hasNewApp = projectList.some((p) => p.isNew);
    const systemItems = [
      {
        id: "win-launchpad",
        kind: "os-win",
        targetWin: "launchpad",
        title: "My Apps Folder",
        subtitle: `${projectCount} Apps Made by Kurizu`,
        file: "my_apps.dir",
        ext: "DIR",
        color: "#a855f7",
        image: "assets/sprites/idle-still.webp",
        isNew: hasNewApp,
      },
      {
        id: "win-work",
        kind: "os-win",
        targetWin: "work",
        title: "Projects Explorer",
        subtitle: "Case Studies & Details",
        file: "projects.exe",
        ext: ".EXE",
        color: "#8b5cf6",
        image: "assets/sprites/idle-still.webp",
      },
      {
        id: "win-gallery",
        kind: "os-win",
        targetWin: "gallery",
        title: "Art Gallery",
        subtitle: "57 Hand-drawn Pieces & Sketches",
        file: "art_gallery.exe",
        ext: ".ART",
        color: "#f43f5e",
        image: "assets/arts/digital/wisteria-night.webp",
      },
      {
        id: "win-kurizu3d",
        kind: "os-win",
        targetWin: "kurizu3d",
        title: "Kurizu 3D Rig",
        subtitle: "Interactive WebGL Character",
        file: "kurizu_3d.exe",
        ext: ".3D",
        color: "#d946ef",
        image: "assets/sprites/mascot-still.webp",
      },
      {
        id: "win-about",
        kind: "os-win",
        targetWin: "about",
        title: "About & Terminal",
        subtitle: "Bio, Toolkit & Shell",
        file: "about_me.txt",
        ext: ".TXT",
        color: "#22c55e",
        image: "assets/sprites/avatar-still.webp",
      },
      {
        id: "win-reel",
        kind: "os-win",
        targetWin: "reel",
        title: "Showreel.mp4",
        subtitle: "2026 Motion & Video Montage",
        file: "showreel.mp4",
        ext: ".MP4",
        color: "#ec4899",
        image: "assets/images/malfoy-desktop.webp",
      },
      {
        id: "win-contact",
        kind: "os-win",
        targetWin: "contact",
        title: "Say Hi / Contact",
        subtitle: "Socials, Links & Collabs",
        file: "contact.exe",
        ext: ".MSG",
        color: "#06b6d4",
        image: "assets/sprites/pet-still.webp",
      },
      {
        id: "win-browser",
        kind: "os-win",
        targetWin: "browser",
        title: "kurizu.exe Browser",
        subtitle: "Welcome & 3am Lab Workbench",
        file: "kurizu.exe",
        ext: ".WWW",
        color: "#a855f7",
        image: "assets/sprites/dance-still.webp",
      },
      {
        id: "win-profile",
        kind: "os-win",
        targetWin: "profile",
        title: "Official Account",
        subtitle: "Verified Profile Card",
        file: "profile.card",
        ext: ".ID",
        color: "#eab308",
        image: "assets/sprites/avatar.webp",
      },
      {
        id: "win-chess",
        kind: "os-win",
        targetWin: "chess",
        title: "Wisteria 3D Chess",
        subtitle: "Easy → Grandmaster vs. 3D Wisteria",
        file: "chess.exe",
        ext: ".3D",
        color: "#c084fc",
        image: "assets/sprites/pet-still.webp",
      },
    ];

    const projectApps = (config.projects || []).map((p) => {
      const meta = APP_EXTENSIONS[p.id] || { file: `${p.id}.exe`, ext: ".APP", color: "#a855f7" };
      return {
        id: p.id,
        kind: p.play ? "game-or-case" : "project",
        title: p.title,
        subtitle: p.subtitle || p.categoryLabel,
        file: meta.file,
        ext: meta.ext,
        color: meta.color,
        image: p.image,
        tags: (p.tags || []).join(" "),
        isNew: Boolean(p.isNew),
      };
    });

    return [...systemItems, ...projectApps];
  }

  function launchDesktopApp(item) {
    playSfx("powerup");
    if (item.kind === "os-win") {
      openDesktopWindow(item.targetWin);
      toast(`opened ${item.file} ✨`);
    } else if (item.kind === "game-or-case" && item.id === "forest-run") {
      openDesktopWindow("arcade");
      toast("opened forest_run.exe arcade cabinet ✨");
    } else if (item.id === "lanshare") {
      openDesktopWindow("dropship");
      toast("opened kurizu.dropship desktop window ✨");
    } else if (item.kind === "project" || item.kind === "game-or-case") {
      openProject(item.id);
      toast(`opened ${item.file} window ✨`);
    } else if (item.kind === "terminal") {
      openDesktopWindow("about");
      window.setTimeout(() => $("#terminalInput")?.focus(), 180);
      toast("opened terminal.sh — type help!");
    }
  }

  const desktopIconOffsets = new Map();

  function initDesktopAppIcons() {
    const osGrid = $("#osDesktopIcons");
    const folderGrids = [$("#desktopAppsGrid"), $("#browserAppsGrid")].filter(Boolean);
    const grids = [osGrid, ...folderGrids].filter(Boolean);
    if (!grids.length) return;
    const allItems = getDesktopShortcutItems();
    // Main desktop shows only the folders & system icons (including the my_apps.dir folder);
    // Opening my_apps.dir reveals the 9 apps made by Kurizu!
    const desktopOnlyItems = allItems.filter((item) => item.kind === "os-win");
    const myAppsOnlyItems = allItems.filter((item) => item.kind !== "os-win");
    const statusEl = $("#desktopSelectionStatus");

    const renderIconButtons = (list) => list.map((item) => {
      const iconMeta = getCustomAppIcon(item.id);
      const artMarkup = iconMeta.img
        ? `<span class="desktop-icon__art desktop-icon__art--img"><img src="${esc(iconMeta.img)}" alt="" loading="lazy"></span>`
        : `<span class="desktop-icon__art">${iconMeta.svg}</span>`;
      return `
      <button type="button" class="desktop-icon${item.isNew ? " is-new" : ""}" role="listitem" data-app-id="${esc(item.id)}" title="${esc(item.title)} — ${esc(item.subtitle)} (Click to open)">
        <span class="desktop-icon__frame" style="--icon-bg:${esc(iconMeta.bg)}">
          ${item.isNew ? '<span class="desktop-icon__new">NEW</span>' : ""}
          ${artMarkup}
          <span class="desktop-icon__ext" style="--ext-bg:${esc(item.color)}">${esc(item.ext)}</span>
          <span class="desktop-icon__shortcut" aria-hidden="true">↗</span>
        </span>
        <span class="desktop-icon__label">${esc(item.file)}</span>
      </button>
    `;
    }).join("");

    if (osGrid) osGrid.innerHTML = renderIconButtons(desktopOnlyItems);
    const myAppsMarkup = renderIconButtons(myAppsOnlyItems);
    folderGrids.forEach((grid) => {
      grid.innerHTML = myAppsMarkup;
    });

    grids.forEach((grid) => {
      grid.addEventListener("click", (e) => {
        const btn = e.target.closest(".desktop-icon[data-app-id]");
        if (!btn || btn.dataset.justDragged === "1") return;
        const appId = btn.dataset.appId;
        const item = allItems.find((x) => x.id === appId);
        if (!item) return;

        $$(".desktop-icon").forEach((ic) => ic.classList.toggle("is-selected", ic.dataset.appId === appId));
        if (statusEl) {
          statusEl.textContent = `Opened: ${item.file} — ${item.subtitle}`;
        }
        launchDesktopApp(item);
      });

      // Drag icons around on the desktop
      $$(".desktop-icon", grid).forEach((iconBtn) => {
        let dragging = false;
        let moved = false;
        let sx = 0, sy = 0, bx = 0, by = 0;

        iconBtn.addEventListener("pointerdown", (e) => {
          if (e.button !== 0 || window.innerWidth <= 720) return;
          dragging = true;
          moved = false;
          const cur = desktopIconOffsets.get(iconBtn) || { x: 0, y: 0 };
          bx = cur.x; by = cur.y;
          sx = e.clientX; sy = e.clientY;
          try { iconBtn.setPointerCapture(e.pointerId); } catch (_) {}
        });

        iconBtn.addEventListener("pointermove", (e) => {
          if (!dragging) return;
          const dx = e.clientX - sx;
          const dy = e.clientY - sy;
          if (!moved && Math.hypot(dx, dy) < 6) return;
          moved = true;
          iconBtn.classList.add("is-dragging");
          const nx = bx + dx;
          const ny = by + dy;
          desktopIconOffsets.set(iconBtn, { x: nx, y: ny });
          iconBtn.style.transform = `translate3d(${Math.round(nx)}px, ${Math.round(ny)}px, 0)`;
        });

        const endIconDrag = (e) => {
          if (!dragging) return;
          dragging = false;
          iconBtn.classList.remove("is-dragging");
          try { iconBtn.releasePointerCapture(e.pointerId); } catch (_) {}
          if (moved) {
            iconBtn.dataset.justDragged = "1";
            window.setTimeout(() => { delete iconBtn.dataset.justDragged; }, 80);
          }
        };
        iconBtn.addEventListener("pointerup", endIconDrag);
        iconBtn.addEventListener("pointercancel", endIconDrag);
      });
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".desktop-icon")) {
        $$(".desktop-icon.is-selected").forEach((ic) => ic.classList.remove("is-selected"));
      }
    });
  }

  // Track managed desktop windows for floating OS window management
  const managedWindows = new Map();
  let focusedWinId = "browser";

  function focusDesktopWindow(id) {
    const info = managedWindows.get(id);
    if (!info) return;
    topZ += 1;
    info.el.style.zIndex = String(topZ);
    focusedWinId = id;
    managedWindows.forEach((w, wid) => {
      w.el.classList.toggle("is-focused", wid === id && !w.el.classList.contains("is-minimized") && !w.el.classList.contains("is-closed"));
    });
    updateTaskbarTray();
  }

  function openDesktopWindow(id) {
    if (document.body.classList.contains("is-wisteria-mad")) {
      const madInput = $("#madCmdInput");
      if (madInput) madInput.focus();
      return;
    }
    const info = managedWindows.get(id);
    if (!info) return;
    // On mobile phones, auto-minimize other open windows so only 1 window is shown at a time
    if (window.innerWidth <= 860) {
      managedWindows.forEach((w, wid) => {
        if (wid !== id && !w.el.classList.contains("is-closed")) {
          w.el.classList.add("is-minimized");
          w.el.classList.remove("is-focused", "is-maximized");
        }
      });
    }
    info.el.classList.remove("is-closed", "is-minimized");
    focusDesktopWindow(id);
    if (id === "kurizu3d") {
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    } else if (id === "dropship") {
      const frame = $("#dropshipIframe");
      if (frame && (!frame.getAttribute("src") || frame.getAttribute("src") === "about:blank")) {
        frame.src = "dropship/index.html?windowed=1";
      }
    } else if (id === "chess") {
      const frame = $("#chessIframe");
      if (frame && (!frame.getAttribute("src") || frame.getAttribute("src") === "about:blank")) {
        frame.src = "chess/index.html?windowed=1";
      }
      window.setTimeout(nudgePetOutsideChessWindow, 40);
    }
  }

  function restoreWindowById(id) {
    openDesktopWindow(id);
  }

  function updateTaskbarTray() {
    const tray = $("#taskbarTray");
    if (!tray) return;
    const pills = [];
    managedWindows.forEach((info, id) => {
      const isClosed = info.el.classList.contains("is-closed");
      if (isClosed) return; // Closed windows leave the taskbar just like Windows OS!
      const isMin = info.el.classList.contains("is-minimized");
      const isFocused = focusedWinId === id && !isMin;
      pills.push(`
        <div class="taskbar__tab-group ${isFocused ? "is-active-tab" : ""} ${isMin ? "is-min-tab" : ""}">
          <button type="button" class="taskbar__tray-btn ${isFocused ? "is-active-pill" : ""} ${isMin ? "is-min-pill" : ""}" data-taskbar-win="${esc(id)}" title="${isMin ? "Restore" : (isFocused ? "Minimize" : "Focus")} ${esc(info.title)}">
            <span class="taskbar__tray-dot"></span>
            <span>${esc(info.title)}</span>
          </button>
          <button type="button" class="taskbar__tab-close" data-taskbar-close="${esc(id)}" aria-label="Close ${esc(info.title)}" title="Close ${esc(info.title)}">×</button>
        </div>
      `);
    });
    tray.innerHTML = pills.join("");
  }

  function restoreAllDesktopWindows() {
    managedWindows.forEach((info, id) => {
      info.el.classList.remove("is-minimized", "is-maximized");
      // Return to clean initial desktop: profile.card open, kurizu.exe closed
      if (id === "profile") info.el.classList.remove("is-closed");
      else info.el.classList.add("is-closed");
      info.el.style.transform = "";
    });
    draggableOffsets.clear();
    document.body.classList.remove("has-maximized-window");
    desktopIconOffsets.forEach((_, iconEl) => {
      iconEl.style.transform = "";
    });
    desktopIconOffsets.clear();
    clearChessEggEffects();
    focusDesktopWindow("profile");
    playSfx("pop");
    toast("desktop reset to clean workspace ✨");
  }

  function toggleShowDesktop() {
    const anyOpenVisible = Array.from(managedWindows.values()).some(
      (info) => !info.el.classList.contains("is-closed") && !info.el.classList.contains("is-minimized")
    );
    managedWindows.forEach((info) => {
      if (!info.el.classList.contains("is-closed")) {
        info.el.classList.remove("is-maximized");
        info.el.classList.toggle("is-minimized", anyOpenVisible);
      }
    });
    document.body.classList.remove("has-maximized-window");
    playSfx("pop");
    updateTaskbarTray();
    toast(anyOpenVisible ? "showing clean desktop ✨" : "restored open windows ✨");
  }

  function initStartMenuPrograms() {
    const listEl = $("#startMenuPrograms");
    const searchInput = $("#startMenuSearch");
    const labelEl = $("#startMenuSectionLabel");
    if (!listEl) return;

    const allItems = getDesktopShortcutItems();

    function renderStartItems(query = "") {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? allItems.filter((it) => `${it.title} ${it.subtitle} ${it.file} ${it.tags || ""}`.toLowerCase().includes(q))
        : allItems;

      if (labelEl) {
        labelEl.textContent = q ? `search results (${filtered.length})` : "all apps & desktop folders";
      }

      if (!filtered.length) {
        listEl.innerHTML = `<p class="start-menu__empty">no apps matching "${esc(query)}"</p>`;
        return;
      }

      listEl.innerHTML = filtered.map((it) => {
        const iconMeta = getCustomAppIcon(it.id);
        return `
        <button type="button" class="start-prog-btn" role="menuitem" data-start-app="${esc(it.id)}">
          <span class="start-prog-btn__art" style="--icon-bg:${esc(iconMeta.bg)}">${iconMeta.svg}</span>
          <span class="start-prog-btn__text">
            <strong>${esc(it.title)}</strong>
            <small>${esc(it.subtitle)}</small>
          </span>
          <span class="start-prog-btn__ext" style="--ext-bg:${esc(it.color)}">${esc(it.ext)}</span>
        </button>
      `;
      }).join("");
    }

    renderStartItems();

    searchInput?.addEventListener("input", () => {
      renderStartItems(searchInput.value);
    });

    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const firstBtn = listEl.querySelector(".start-prog-btn[data-start-app]");
        if (firstBtn) firstBtn.click();
      }
    });

    listEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".start-prog-btn[data-start-app]");
      if (!btn) return;
      const item = allItems.find((x) => x.id === btn.dataset.startApp);
      if (!item) return;
      launchDesktopApp(item);
      const sm = $("#startMenu");
      const st = $("#startToggle");
      if (sm) sm.hidden = true;
      if (st) st.setAttribute("aria-expanded", "false");
    });

    $("#startToggle")?.addEventListener("click", () => {
      window.setTimeout(() => {
        const sm = $("#startMenu");
        if (sm && !sm.hidden && searchInput) {
          searchInput.value = "";
          renderStartItems("");
          searchInput.focus();
        }
      }, 40);
    });
  }

  function initDesktopWindowManager() {
    const osLayer = $("#osDesktop");
    const windowSpecs = [
      { id: "browser", sel: "#heroBrowser", title: "kurizu.exe", barSel: "#browserTabs", startOpen: false },
      { id: "work", sel: ".explorer", title: "projects.exe", startOpen: false },
      { id: "gallery", sel: ".gallery-window", title: "art_gallery.exe", startOpen: false },
      { id: "kurizu3d", sel: "#kurizu3d", title: "kurizu_3d.exe", startOpen: false },
      { id: "arcade", sel: ".arcade-window", title: "forest_run.exe", startOpen: false },
      { id: "about", sel: ".about-window", title: "about_me.txt", startOpen: false },
      { id: "reel", sel: "#reel", title: "showreel.mp4", startOpen: false },
      { id: "contact", sel: ".contact-window", title: "contact.exe", startOpen: false },
      { id: "profile", sel: ".profile-card", title: "profile.card", startOpen: true },
      { id: "dropship", sel: "#dropshipWindow", title: "kurizu.dropship", startOpen: false },
      { id: "chess", sel: "#chessWindow", title: "wisteria_chess.exe", startOpen: false },
      { id: "app", sel: "#appWindow", title: "case_study.exe", startOpen: false },
      { id: "launchpad", sel: "#desktopLaunchpad", title: "my_apps.dir", startOpen: false },
    ];

    windowSpecs.forEach((spec, index) => {
      const win = $(spec.sel);
      if (!win) return;
      const bar = spec.barSel ? $(spec.barSel, win) : $(".window__bar", win);
      if (!bar) return;

      win.dataset.winId = spec.id;
      win.classList.add("os-floating-win");
      win.removeAttribute("data-reveal");
      win.classList.add("is-visible");
      // Move window into the fixed Desktop OS workspace layer so parent sections don't clip or scroll
      if (osLayer && win.parentElement !== osLayer) {
        osLayer.appendChild(win);
      }

      if (!spec.startOpen) {
        win.classList.add("is-closed");
      } else {
        topZ += 1;
        win.style.zIndex = String(topZ);
        win.classList.add("is-focused");
      }

      managedWindows.set(spec.id, { id: spec.id, el: win, bar, title: spec.title, idx: index });

      // Make window draggable by its titlebar if not already marked data-draggable
      if (!win.hasAttribute("data-draggable")) {
        win.setAttribute("data-draggable", spec.id);
        bar.setAttribute("data-drag-handle", "");
      }

      // Clicking anywhere on the window brings it to the front!
      win.addEventListener("pointerdown", () => {
        if (!win.classList.contains("is-closed") && !win.classList.contains("is-minimized")) {
          focusDesktopWindow(spec.id);
        }
      });

      // Make the 3 retro traffic dots interactive (dot 1 = close, dot 2 = minimize, dot 3 = maximize)
      const dots = $(".win-dots", bar);
      if (dots) {
        dots.removeAttribute("aria-hidden");
        const dotItems = $$("i", dots);
        if (dotItems[0]) { dotItems[0].title = "Close window"; dotItems[0].dataset.winAct = "close"; }
        if (dotItems[1]) { dotItems[1].title = "Minimize to taskbar"; dotItems[1].dataset.winAct = "minimize"; }
        if (dotItems[2]) { dotItems[2].title = "Maximize / restore"; dotItems[2].dataset.winAct = "maximize"; }
      }

      // Inject crisp OS window control buttons [ — ] [ □ ] [ × ] on the right side of the titlebar
      if (!$(".win-controls", bar)) {
        const ctrls = document.createElement("div");
        ctrls.className = "win-controls";
        ctrls.innerHTML = `
          <button type="button" class="win-ctrl win-ctrl--min" data-win-act="minimize" aria-label="Minimize ${esc(spec.title)}" title="Minimize to taskbar">—</button>
          <button type="button" class="win-ctrl win-ctrl--max" data-win-act="maximize" aria-label="Maximize or restore ${esc(spec.title)}" title="Maximize / Restore">□</button>
          <button type="button" class="win-ctrl win-ctrl--close" data-win-act="close" aria-label="Close ${esc(spec.title)}" title="Close window">×</button>
        `;
        bar.appendChild(ctrls);
      }

      bar.addEventListener("click", (e) => {
        const actEl = e.target.closest("[data-win-act]");
        if (!actEl) return;
        e.stopPropagation();
        const act = actEl.dataset.winAct;

        if (act === "minimize") {
          win.classList.remove("is-maximized", "is-focused");
          document.body.classList.toggle("has-maximized-window", !!$(".window.is-maximized"));
          win.classList.add("is-minimized");
          playSfx("pop");
          updateTaskbarTray();
          toast(`minimized ${spec.title} to taskbar`);
        } else if (act === "maximize") {
          win.classList.remove("is-minimized");
          const max = win.classList.toggle("is-maximized");
          document.body.classList.toggle("has-maximized-window", !!$(".window.is-maximized"));
          focusDesktopWindow(spec.id);
          playSfx("pop");
          if (spec.id === "kurizu3d") window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
        } else if (act === "close") {
          win.classList.remove("is-maximized", "is-minimized", "is-focused");
          document.body.classList.toggle("has-maximized-window", !!$(".window.is-maximized"));
          win.classList.add("is-closed");
          if (spec.id === "chess") clearChessEggEffects();
          playSfx("pop");
          updateTaskbarTray();
        }
      });
    });

    // Move the floating Music Player widget onto the desktop surface corner (toggled by bottom-right taskbar icon)
    const musicWidget = $(".now-playing");
    const musicTrayBtn = $("#musicTrayToggle");
    if (osLayer && musicWidget) {
      musicWidget.classList.add("os-desktop__music", "is-hidden");
      osLayer.appendChild(musicWidget);

      const setMusicPopupOpen = (open) => {
        musicWidget.classList.toggle("is-hidden", !open);
        musicTrayBtn?.classList.toggle("is-active", open);
        musicTrayBtn?.setAttribute("aria-expanded", String(open));
        playSfx("pop");
      };

      musicTrayBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !musicWidget.classList.contains("is-hidden");
        setMusicPopupOpen(!isOpen);
      });
    }

    // Start with kurizu.exe closed so only profile.card is open on initial load
    focusDesktopWindow("profile");

    $("#dropshipInfoBtn")?.addEventListener("click", () => {
      openProject("lanshare");
    });

    // Re-bind draggable behavior now that all floating windows have data-draggable
    initDraggableWindows();
    updateTaskbarTray();

    // Taskbar tab clicks (minimize if focused, otherwise restore & focus) and × close button
    $("#taskbarTray")?.addEventListener("click", (e) => {
      const closeBtn = e.target.closest("[data-taskbar-close]");
      if (closeBtn) {
        e.stopPropagation();
        const id = closeBtn.dataset.taskbarClose;
        const info = managedWindows.get(id);
        if (info) {
          info.el.classList.remove("is-maximized", "is-minimized", "is-focused");
          info.el.classList.add("is-closed");
          if (id === "chess") clearChessEggEffects();
          playSfx("pop");
          updateTaskbarTray();
        }
        return;
      }
      const btn = e.target.closest("[data-taskbar-win]");
      if (!btn) return;
      const id = btn.dataset.taskbarWin;
      const info = managedWindows.get(id);
      if (!info) return;
      const isMin = info.el.classList.contains("is-minimized");
      const isFocused = focusedWinId === id && !isMin;
      if (isFocused) {
        info.el.classList.add("is-minimized");
        info.el.classList.remove("is-focused", "is-maximized");
        playSfx("pop");
        updateTaskbarTray();
      } else {
        openDesktopWindow(id);
        playSfx("pop");
      }
    });

    $("#desktopRestoreAllBtn")?.addEventListener("click", restoreAllDesktopWindows);
    $("#showDesktopBtn")?.addEventListener("click", toggleShowDesktop);
    $("#startShowDesktop")?.addEventListener("click", () => {
      toggleShowDesktop();
      const sm = $("#startMenu");
      if (sm) sm.hidden = true;
    });

    // Intercept #hash navigation links (#about, #work, #arcade, #media, #contact, #home, #kurizu3d) to open floating desktop windows instead of scrolling!
    document.addEventListener("click", (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const hash = link.getAttribute("href");
      const map = {
        "#home": "browser",
        "#about": "about",
        "#work": "work",
        "#arcade": "arcade",
        "#media": "gallery",
        "#reel": "reel",
        "#kurizu3d": "kurizu3d",
        "#contact": "contact",
      };
      if (map[hash]) {
        e.preventDefault();
        if (window.innerWidth <= 860 && hash === "#home" && link.classList.contains("taskbar__app")) {
          toggleShowDesktop();
        } else {
          openDesktopWindow(map[hash]);
          playSfx("pop");
        }
        const sm = $("#startMenu");
        if (sm) sm.hidden = true;
        const mm = $("#mobileMenu");
        if (mm && mm.getAttribute("aria-hidden") === "false") {
          $("#menuToggle")?.click();
        }
      }
    });

    // Escape exits maximized window
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const maxWin = $(".window.is-maximized");
        if (maxWin) {
          maxWin.classList.remove("is-maximized");
          document.body.classList.remove("has-maximized-window");
          playSfx("pop");
        }
      }
    });
  }

  initDesktopAppIcons();
  initDesktopWindowManager();
  initStartMenuPrograms();

  /* ============================================================
     PARTY MODE + INTERACTIVE TERMINAL (about_me.txt)
     ============================================================ */
  let partyMode = false;
  let partyInterval = null;
  function togglePartyMode(force) {
    partyMode = typeof force === "boolean" ? force : !partyMode;
    document.body.classList.toggle("is-party", partyMode);
    playSfx(partyMode ? "powerup" : "pop", true);
    if (partyInterval) { clearInterval(partyInterval); partyInterval = null; }
    if (partyMode) {
      spawnHeartShower(window.innerWidth / 2, window.innerHeight / 2, 28);
      partyInterval = window.setInterval(() => {
        if (!partyMode) return;
        const rx = window.innerWidth * (0.15 + Math.random() * 0.7);
        const ry = window.innerHeight * (0.2 + Math.random() * 0.5);
        spawnHeartShower(rx, ry, 10);
      }, 1600);
      toast("★ PARTY MODE ACTIVATED ★");
    } else {
      toast("party mode off — back to cozy purple");
    }
  }

  function initInteractiveTerminal() {
    const termLines = $("#terminalLines");
    const termForm = $("#terminalForm");
    const termInput = $("#terminalInput");
    const termBox = $("#interactiveTerminal");
    if (!termLines || !termForm || !termInput) return;

    function pushTermLine(html, isCmd = false) {
      const p = document.createElement("p");
      if (isCmd) {
        p.innerHTML = `<span class="term-pink">$</span> ${esc(html)}`;
      } else {
        p.innerHTML = html;
      }
      termLines.appendChild(p);
      while (termLines.childElementCount > 14) {
        termLines.firstElementChild?.remove();
      }
      termLines.scrollTop = termLines.scrollHeight;
    }

    function runTermCommand(raw) {
      const cmdLine = (raw || "").trim();
      if (!cmdLine) return;
      pushTermLine(cmdLine, true);
      const parts = cmdLine.toLowerCase().split(/\s+/);
      const cmd = parts[0];
      const arg = parts.slice(1).join(" ");

      if (cmd === "help" || cmd === "?") {
        playSfx("pop");
        pushTermLine(`available: <b>projects</b> · <b>open &lt;id&gt;</b> · <b>party</b> · <b>pet</b> · <b>malfoy</b> · <b>whoami</b> · <b>clear</b>`);
      } else if (cmd === "clear" || cmd === "cls") {
        termLines.innerHTML = "";
        pushTermLine(`terminal cleared. type <b>help</b> for commands.`);
      } else if (cmd === "whoami" || cmd === "kurizu") {
        playSfx("pop");
        pushTermLine(`<b>kurizu</b> — self-taught dev, designer &amp; level 99 purple pixel collector from PH.`);
      } else if (cmd === "projects" || cmd === "ls") {
        playSfx("pop");
        const ids = (config.projects || []).map((p) => `<b>${esc(p.id)}</b>`).join(" · ");
        pushTermLine(`shipped (${config.projects.length}): ${ids}`);
        pushTermLine(`tip: type <b>open aipet</b> or <b>open pixify</b> to inspect!`);
      } else if (cmd === "open") {
        const target = (config.projects || []).find(
          (p) => p.id.toLowerCase() === arg || p.title.toLowerCase().includes(arg)
        );
        if (target && arg) {
          playSfx("coin");
          pushTermLine(`launching <b>${esc(target.title)}</b> case_study.exe...`);
          window.setTimeout(() => openProject(target.id), 250);
        } else {
          playSfx("error");
          pushTermLine(`project not found. try: <b>open aipet</b>, <b>open pixify</b>, <b>open wobble</b>`);
        }
      } else if (cmd === "party" || cmd === "disco" || cmd === "rave") {
        togglePartyMode();
        pushTermLine(`party_mode = <b>${partyMode ? "ON ✨" : "OFF"}</b>`);
      } else if (cmd === "pet" || cmd === "feed" || cmd === "wisteria") {
        feedPet();
        pushTermLine(`fed Wisteria a pixel cookie! happiness = <b>${petHappiness}%</b> ♡`);
      } else if (cmd === "malfoy" || cmd === "malfoy.exe" || cmd === "hack") {
        playSfx("error");
        termBox?.classList.add("is-glitching");
        pushTermLine(`<span class="term-pink">[WARNING]</span> malfoid.exe intercepting System32... jk! type <b>i love you malfoid</b> ♡`);
        window.setTimeout(() => termBox?.classList.remove("is-glitching"), 900);
      } else if (cmd === "play" || cmd === "arcade" || cmd === "game") {
        playSfx("coin");
        pushTermLine(`booting <b>forest_run.exe</b>...`);
        window.setTimeout(openGame, 250);
      } else if (cmd === "sudo") {
        playSfx("error");
        pushTermLine(`nice try! only Wisteria has root access on kurizu.exe :3`);
      } else {
        playSfx("error");
        pushTermLine(`command not found: <b>${esc(cmd)}</b>. type <b>help</b> for a list.`);
      }
    }

    termForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = termInput.value;
      termInput.value = "";
      runTermCommand(val);
    });

    termBox?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-term-cmd]");
      if (chip) {
        runTermCommand(chip.dataset.termCmd);
        return;
      }
      if (!e.target.closest("input, button, a")) {
        termInput.focus();
      }
    });
  }
  initInteractiveTerminal();

  /* ============================================================
     WISTERIA · the little pet + chat
     ============================================================ */
  const petRoot = $("#pet");
  const petStage = $(".pet__stage", petRoot);
  const petAnimWrap = $("#petAnimWrap");
  const petImg = $("#petImg");
  const petBubble = $("#petBubble");
  const petChat = $("#petChat");
  const petChatToggle = $("#petChatToggle");
  const petChatLog = $("#petChatLog");
  const petChatForm = $("#petChatForm");
  const petChatInput = $("#petChatInput");

  let petMoodCurrent = "idle";
  let petBusy = false;
  let petChatOpen = false;
  let petIdleTimer = 0;
  let petChattyTimer = 0;
  let petBubbleTimer = 0;
  let petBounceTimer = 0;
  let petActionTimer = 0;
  let petTeleportTimer = 0;
  let petChoiceActive = false;
  let lastPromptIdx = -1;
  let petRAF = 0;
  let petDir = 1;
  let petX = 0;
  let petY = 0;
  let petHappiness = 85;
  const PET_MAD_KEY = "kurizu.wisteriaMad";
  const PET_MAD_STARE_SPRITE = "assets/Pet/poke animation/SampleCharacter7_Hurt_2026-11-17-16-32-43.webp";
  let petIsMad = false;
  let petPokeCount = 0;
  let petPokeDecayTimer = 0;
  let petMadTimers = [];
  let musicRateTimer = 0;

  try {
    petIsMad = window.localStorage.getItem(PET_MAD_KEY) === "1";
    const savedHappy = parseInt(window.localStorage.getItem("kurizu.petHappy"), 10);
    if (!Number.isNaN(savedHappy)) petHappiness = petIsMad ? 0 : Math.min(100, Math.max(20, savedHappy));
  } catch (_) {}

  function updatePetHappyUI(delta = 0) {
    if (petIsMad) {
      petHappiness = 0;
    } else {
      petHappiness = Math.min(100, Math.max(10, petHappiness + delta));
    }
    try { window.localStorage.setItem("kurizu.petHappy", String(petHappiness)); } catch (_) {}
    const fill = $("#petHappyFill");
    const val = $("#petHappyVal");
    if (fill) fill.style.width = `${petHappiness}%`;
    if (val) val.textContent = `${petHappiness}%`;
  }
  updatePetHappyUI(0);

  function rampMusicPlaybackRate(targetRate, durationMs = 600) {
    window.clearInterval(musicRateTimer);
    if (!durationMs) {
      applyPlayerPitchAndRate(targetRate);
      return;
    }
    const startRate = Number(player.playbackRate) || 1;
    const steps = 12;
    let step = 0;
    musicRateTimer = window.setInterval(() => {
      step += 1;
      const t = step / steps;
      const next = +(startRate + (targetRate - startRate) * t).toFixed(3);
      applyPlayerPitchAndRate(next);
      if (step >= steps) {
        window.clearInterval(musicRateTimer);
        applyPlayerPitchAndRate(targetRate);
      }
    }, Math.max(20, Math.floor(durationMs / steps)));
  }

  function clearPetMadSequenceTimers() {
    petMadTimers.forEach((id) => window.clearTimeout(id));
    petMadTimers = [];
  }

  function pushMadCmdLine(text, kind = "") {
    const logEl = $("#madCmdLog");
    if (!logEl) return;
    const p = document.createElement("p");
    p.className = "mad-cmd__line" + (kind ? ` mad-cmd__line--${kind}` : "");
    p.textContent = text;
    logEl.appendChild(p);
    while (logEl.childElementCount > 40) {
      logEl.firstElementChild?.remove();
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function closeAllDesktopForMadPet() {
    if (petChatOpen) chatClose();
    if (partyMode) togglePartyMode(false);
    setStartMenu(false);
    setMobileMenu(false);
    [gameDialog, projectDialog, lightbox].forEach((dlg) => {
      try { if (dlg && dlg.open) dlg.close(); } catch (_) {}
    });
    managedWindows.forEach((info) => {
      info.el.classList.remove("is-maximized", "is-minimized", "is-focused");
      info.el.classList.add("is-closed");
    });
    document.body.classList.remove("has-maximized-window");
    const musicWidget = $(".now-playing");
    if (musicWidget) musicWidget.classList.add("is-hidden");
    const tray = $("#taskbarTray");
    if (tray) tray.innerHTML = "";
  }

  function setPetSilentStare() {
    petStopTimers();
    stopWalk();
    petChoiceActive = false;
    if (petBubble) {
      petBubble.classList.remove("is-visible", "has-choice");
      petBubble.textContent = "";
    }
    if (petImg) {
      petImg.src = petSrc(PET_MAD_STARE_SPRITE);
    }
    // Center Wisteria slightly and lock her on the floor staring straight ahead
    petY = 0;
    if (petStage) {
      petStage.style.transition = "transform 0.35s ease";
      petStage.style.transform = `translate3d(${Math.round(petX)}px, 0, 0)`;
    }
  }

  function triggerPetMadMode(options = {}) {
    const fromReload = Boolean(options.fromReload);
    petIsMad = true;
    try { window.localStorage.setItem(PET_MAD_KEY, "1"); } catch (_) {}
    updatePetHappyUI(0);
    clearPetMadSequenceTimers();

    document.body.classList.add("is-wisteria-mad");
    setPetSilentStare();
    rampMusicPlaybackRate(0.52, fromReload ? 0 : 750);

    const madCmd = $("#wisteriaMadCmd");
    const madLog = $("#madCmdLog");
    const madInput = $("#madCmdInput");
    if (madLog) madLog.innerHTML = "";
    if (madCmd) madCmd.hidden = false;

    const desktopIcons = $$("#osDesktopIcons .desktop-icon");

    if (fromReload) {
      closeAllDesktopForMadPet();
      document.body.classList.add("is-desktop-wiped");
      desktopIcons.forEach((ic) => ic.classList.add("is-deleted"));
      pushMadCmdLine("Microsoft Windows [Version 10.0.26100.1] — WISTERIA_OVERRIDE", "sys");
      pushMadCmdLine("C:\\WINDOWS\\system32> wisteria_boot_lock.sys", "err");
      pushMadCmdLine("[NICE TRY] You refreshed the website, but Wisteria is STILL mad.", "warn");
      pushMadCmdLine("[STATUS] All desktop windows closed. Desktop files deleted. Wallpaper = BLACK.", "err");
      pushMadCmdLine("[WISTERIA] \"...\" (She is just staring at you in complete silence.)", "sys");
      pushMadCmdLine("[RECOVERY] Type \"give cookies\" or \"give ram\" below to make her happy again.", "ok");
      window.setTimeout(() => madInput?.focus(), 120);
      return;
    }

    // Live dramatic meltdown sequence when poked too many times!
    playSfx("error");
    pushMadCmdLine("C:\\WINDOWS\\system32> wisteria_revenge.bat --force", "err");
    pushMadCmdLine("[CRITICAL] Poke limit exceeded! Wisteria mood dropped to 0% (FURIOUS).", "warn");

    petMadTimers.push(window.setTimeout(() => {
      playSfx("error");
      pushMadCmdLine("C:\\WINDOWS\\system32> taskkill /F /IM explorer_windows.exe", "err");
      pushMadCmdLine("Closing all open desktop windows ... TERMINATED", "warn");
      closeAllDesktopForMadPet();
    }, 380));

    const filesToDelete = [
      "C:\\kurizu\\desktop\\kurizu.exe",
      "C:\\kurizu\\desktop\\my_apps.dir",
      "C:\\kurizu\\desktop\\projects.exe",
      "C:\\kurizu\\desktop\\aipet.exe",
      "C:\\kurizu\\desktop\\forest_run.exe",
      "C:\\kurizu\\desktop\\kurizu_3d.exe",
      "C:\\kurizu\\desktop\\art_gallery.exe",
      "C:\\kurizu\\desktop\\kurizu.dropship",
      "C:\\kurizu\\desktop\\about_me.txt",
      "C:\\kurizu\\desktop\\contact.exe",
      "C:\\kurizu\\system\\purple_wallpaper.sys",
    ];

    filesToDelete.forEach((filePath, idx) => {
      petMadTimers.push(window.setTimeout(() => {
        playSfx("error");
        pushMadCmdLine(`del /F /Q ${filePath} ... DELETED`, "err");
        const iconEl = desktopIcons[idx];
        if (iconEl) {
          iconEl.classList.add("is-deleting");
          window.setTimeout(() => iconEl.classList.add("is-deleted"), 260);
        }
      }, 720 + idx * 170));
    });

    const finishDelay = 720 + filesToDelete.length * 170 + 180;
    petMadTimers.push(window.setTimeout(() => {
      document.body.classList.add("is-desktop-wiped");
      desktopIcons.forEach((ic) => ic.classList.add("is-deleted"));
      pushMadCmdLine("------------------------------------------------------------", "sys");
      pushMadCmdLine("[VOID] Desktop wiped. Wallpaper set to #000000. Audio slowed to 52%.", "warn");
      pushMadCmdLine("[WISTERIA] \"...\" (She is staring right at you and refuses to speak.)", "sys");
      pushMadCmdLine("[RECOVERY] Type \"give cookies\" or \"give ram\" to appease her and restore the site.", "ok");
      madInput?.focus();
    }, finishDelay));
  }

  function appeaseMadPet(offeringType = "cookies") {
    if (!petIsMad) return;
    clearPetMadSequenceTimers();
    const isRam = offeringType === "ram";
    pushMadCmdLine(
      `[OFFERING ACCEPTED] ${isRam ? "64GB DDR5 RGB RAM sticks" : "Warm batch of purple pixel cookies 🍪"} delivered to Wisteria!`,
      "ok"
    );
    pushMadCmdLine("Restoring C:\\kurizu\\system\\purple_wallpaper.sys ... OK", "ok");
    pushMadCmdLine("Restoring desktop files, saturation, and audio speed ... OK", "ok");
    pushMadCmdLine("wisteria.mood = HAPPY (100%) ♡Rebooting desktop...", "ok");
    playSfx("powerup");

    window.setTimeout(() => {
      petIsMad = false;
      petPokeCount = 0;
      try { window.localStorage.removeItem(PET_MAD_KEY); } catch (_) {}

      const madCmd = $("#wisteriaMadCmd");
      if (madCmd) madCmd.hidden = true;

      document.body.classList.remove("is-wisteria-mad", "is-desktop-wiped", "is-wisteria-poke-warn");
      $$("#osDesktopIcons .desktop-icon").forEach((ic) => {
        ic.classList.remove("is-deleting", "is-deleted");
      });

      rampMusicPlaybackRate(1, 500);
      petHappiness = 100;
      updatePetHappyUI(100);
      restoreAllDesktopWindows();

      petMoodCurrent = "headpat";
      petPlay("headpat");
      triggerPetBounce();
      if (petStage) {
        const r = petStage.getBoundingClientRect();
        spawnHeartShower(r.left + r.width / 2, r.top + r.height / 3, 24);
      }
      petSay(
        isRam
          ? "munch munch!! ⚡ 64GB of tasty RAM?! okay i forgive you... i brought your desktop back! don't poke me like that again ♡"
          : "nom nom nom!! 🍪 warm pixel cookies?! okay i forgive you... i brought your desktop back! be nice to me now ♡",
        5200
      );

      window.setTimeout(() => {
        petBusy = false;
        goIdle();
        petChatty();
        scheduleNextPetTeleport(12000);
      }, 2200);
    }, 650);
  }

  function initMadCmdTerminal() {
    const madCmd = $("#wisteriaMadCmd");
    const madForm = $("#madCmdForm");
    const madInput = $("#madCmdInput");
    const denyCloseBtn = $("#madCmdDenyClose");
    if (!madCmd || !madForm || !madInput) return;

    function handleMadCommand(raw) {
      const val = (raw || "").trim();
      if (!val) return;
      pushMadCmdLine(`C:\\kurizu\\void> ${val}`, "sys");
      const q = val.toLowerCase();

      if (/\b(ram|ddr|memory|megabyte|gigabyte)\b/i.test(q)) {
        appeaseMadPet("ram");
      } else if (/\b(cookie|cookies|biscuit|snack|treat|food|eat|feed)\b/i.test(q)) {
        appeaseMadPet("cookies");
      } else if (/\b(help|\?|commands)\b/i.test(q)) {
        playSfx("pop");
        pushMadCmdLine("Available recovery commands: \"give cookies\" or \"give ram\"", "warn");
      } else if (/\b(sorry|apologize|forgive|please|love)\b/i.test(q)) {
        playSfx("error");
        pushMadCmdLine("[WISTERIA] \"...\" (Words aren't enough. She wants snacks: type \"give cookies\" or \"give ram\".)", "warn");
      } else {
        playSfx("error");
        pushMadCmdLine(`'${val}' is not recognized by Wisteria. Type "give cookies" or "give ram" to fix her mood.`, "err");
      }
    }

    madForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = madInput.value;
      madInput.value = "";
      handleMadCommand(v);
    });

    madCmd.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-mad-cmd]");
      if (chip) {
        madInput.value = "";
        handleMadCommand(chip.dataset.madCmd);
        return;
      }
      if (!e.target.closest("button, input")) {
        madInput.focus();
      }
    });

    denyCloseBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      playSfx("error");
      pushMadCmdLine("[ACCESS DENIED] You cannot close cmd.exe while Wisteria is mad! Type \"give cookies\" or \"give ram\".", "err");
      madInput.focus();
    });
  }
  initMadCmdTerminal();

  function feedPet() {
    if (petIsMad) {
      appeaseMadPet("cookies");
      return;
    }
    petPokeCount = 0;
    rampMusicPlaybackRate(1, 250);
    if (petChatOpen) chatClose();
    petStopWalk();
    updatePetHappyUI(15);
    playSfx("powerup");
    petMoodCurrent = "headpat";
    petPlay("headpat");
    triggerPetBounce();
    petBusy = true;
    const snacks = [
      "nom nom nom!! pixel cookie acquired ♡ (+15% happy)",
      "munch munch! best snack in the whole browser! ✨",
      "yummy!! ram coins and cookies are my favourite diet ♡",
      "waaah thank you for the treat!! happiness at " + petHappiness + "%!",
    ];
    petSay(petPick(snacks));
    if (petStage) {
      const r = petStage.getBoundingClientRect();
      spawnHeartShower(r.left + r.width / 2, r.top + r.height / 3, 12);
    }
    window.clearTimeout(petActionTimer);
    petActionTimer = window.setTimeout(() => { petBusy = false; petToIdle(); }, 1500);
  }

  $("#petFeedBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    feedPet();
  });

  const petAnims = (mood) => (config.pet && config.pet.moods && config.pet.moods[mood]) || [];
  const petPick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : "");
  const petSrc = (src) => (src ? encodeURI(String(src)) : "");
  const petBubblesFor = (kind) => (config.pet && config.pet.bubbles && config.pet.bubbles[kind]) || [];

  const petStopTimers = () => {
    window.clearTimeout(petIdleTimer);
    window.clearTimeout(petChattyTimer);
    window.clearTimeout(petBubbleTimer);
    window.clearTimeout(petBounceTimer);
    window.clearTimeout(petActionTimer);
    window.clearTimeout(petTeleportTimer);
    petChoiceActive = false;
    petBubble?.classList.remove("has-choice");
    if (petAnimWrap) petAnimWrap.classList.remove("is-bouncing", "is-teleporting-out", "is-teleporting-in");
    if (petImg) petImg.classList.remove("is-bouncing");
    if (petStage) petStage.classList.remove("is-bouncing");
  };

  function triggerPetBounce() {
    const targets = [petAnimWrap, petImg, petStage].filter(Boolean);
    if (!targets.length) return;
    targets.forEach((el) => el.classList.remove("is-bouncing"));
    // Trigger reflow to restart animation on every click
    void (petAnimWrap || petImg || petStage).offsetWidth;
    targets.forEach((el) => el.classList.add("is-bouncing"));
    window.clearTimeout(petBounceTimer);
    petBounceTimer = window.setTimeout(() => {
      targets.forEach((el) => el.classList.remove("is-bouncing"));
    }, 560);
  }

  const petStopWalk = () => {
    cancelAnimationFrame(petRAF);
    petRAF = 0;
    if (petStage && petX === 0 && petY === 0) petStage.style.transform = "";
  };

  function petSay(text, duration = 2800) {
    if (!petBubble || petIsMad) return;
    petChoiceActive = false;
    petBubble.classList.remove("has-choice");
    petBubble.textContent = text;
    petBubble.classList.add("is-visible");
    window.clearTimeout(petBubbleTimer);
    petBubbleTimer = window.setTimeout(() => petBubble.classList.remove("is-visible"), duration);
  }

  /* Magical Pixel Portal + Sparkle Burst VFX on Wisteria Teleport */
  function spawnTeleportVfx(originX, originY) {
    const layer = $("#cursorHearts");
    if (!layer) return;
    const cx = originX ?? window.innerWidth / 2;
    const cy = originY ?? window.innerHeight / 2;

    // 1. Expanding portal ring + flash core
    const portal = document.createElement("div");
    portal.className = "teleport-vfx";
    portal.style.left = `${Math.round(cx)}px`;
    portal.style.top = `${Math.round(cy)}px`;
    portal.innerHTML = `<span class="teleport-vfx__core"></span><span class="teleport-vfx__ring"></span><span class="teleport-vfx__ring teleport-vfx__ring--outer"></span>`;
    layer.appendChild(portal);
    window.setTimeout(() => portal.remove(), 750);

    // 2. Radial burst of glowing pixel sparkles, bolts & stars
    const colors = ["#bef264", "#38bdf8", "#ff5ea8", "#fde047", "#e879f9", "#ffffff"];
    const icons = ["#i-sparkle", "#i-star", "#i-bolt", "#i-heart"];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      p.setAttribute("class", "teleport-particle");
      p.setAttribute("viewBox", "0 0 24 24");
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.35 - 0.175);
      const dist = 48 + Math.random() * 76;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      p.style.left = `${Math.round(cx)}px`;
      p.style.top = `${Math.round(cy)}px`;
      p.style.color = colors[i % colors.length];
      p.style.setProperty("--tx", `${dx.toFixed(1)}px`);
      p.style.setProperty("--ty", `${dy.toFixed(1)}px`);
      p.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 260)}deg`);
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", icons[i % icons.length]);
      p.appendChild(use);
      layer.appendChild(p);
      window.setTimeout(() => p.remove(), 720);
    }
  }

  const PET_TELEPORT_PROMPTS = [
    {
      question: "🐾 *zwoop!* wanna watch ME play Into the Forest by myself?! 🎮✨",
      yesReply: "hold my cookies!! jumping into forest_run.exe right now!! 🐾⚡",
      act: () => openGameWithWisteria("story"),
    },
    {
      question: "♟️ *knocks over a pawn* wanna play 3D Chess against me?! Easy to Grandmaster!! ✨",
      yesReply: "opening wisteria_chess.exe right now!! sit across from me, human!! ♟️💜",
      act: () => openDesktopWindow("chess"),
    },
    {
      question: "⚡ *zwoop!* hey human! would you like to play Do Not Stop (forest_run.exe)? 🎮",
      yesReply: "yay!! opening the arcade cabinet! don't stop running! ✨",
      act: () => openDesktopWindow("arcade"),
    },
    {
      question: "✨ *poof!* wanna spin Kurizu's 3D rigged character model in 360°? 🧊",
      yesReply: "ta-da!! try the flip jump and turntable controls! ♡",
      act: () => openDesktopWindow("kurizu3d"),
    },
    {
      question: "🎨 *blink!* would you like to explore Kurizu's 57 hand-drawn artworks & pixel sketches?",
      yesReply: "opening art_gallery.exe! so many purple pixels ♡",
      act: () => openDesktopWindow("gallery"),
    },
    {
      question: "📁 *warp!* wanna check out all 10 apps & projects in projects.exe?",
      yesReply: "here's projects.exe! click any app to rate or leave a comment ✨",
      act: () => openDesktopWindow("work"),
    },
    {
      question: "🧪 *zap!* would you like to try KURIZU.pixify (pixel art cleaner & vectorizer)?",
      yesReply: "opening pixify! crispy pixel grids incoming ✨",
      act: () => openProject("pixify"),
    },
    {
      question: "〰️ *boing!* wanna try Wobble Studio and paint bouncy motion onto drawings?",
      yesReply: "wobble wobble!! everything looks better when it jiggles ♡",
      act: () => openProject("wobble"),
    },
    {
      question: "🌙 *shazam!* dare to inspect Malfoy.exe — the polite desktop prank?",
      yesReply: "hehe remember the secret password: 'i love you malfoid'!",
      act: () => openProject("malfoy"),
    },
    {
      question: "💖 *sparkle!* wanna make it rain hearts and stars across the desktop right now?",
      yesReply: "HEART STORM ACTIVATED!! ♡♡♡",
      act: () => {
        playSfx("powerup");
        spawnHeartRain(48);
      },
    },
    {
      question: "🎉 *pop!* would you like to toggle Party Mode on the desktop?",
      yesReply: "untz untz!! party vibes engaged! ✨",
      act: () => {
        const partyBtn = document.querySelector('[data-lab-action="party"]');
        if (partyBtn) partyBtn.click();
        else spawnHeartRain(36);
      },
    },
    {
      question: "🎬 *flash!* wanna watch the 2026 motion showreel.mp4 together?",
      yesReply: "grab some pixel popcorn! 🍿✨",
      act: () => openDesktopWindow("reel"),
    },
    {
      question: "📡 *beam!* wanna try KURIZU.dropship — local Wi-Fi file & note sharing?",
      yesReply: "opening KURIZU.dropship! no cloud, just purple Wi-Fi magic ✨",
      act: () => openProject("lanshare"),
    },
    {
      question: "🍪 *poof!* i teleported all this way! will you feed me a pixel cookie snack?",
      yesReply: "NOM NOM NOM!! best human on the internet ♡",
      act: () => feedPet(),
    },
  ];

  const PET_NO_REPLIES = [
    "oki doki! maybe next teleport~ ♡",
    "fair enough! i'll just vibe right here :3",
    "no worries human! poke me if you need me ✨",
    " Roger that! keeping watch over your desktop ♡",
  ];

  function petAskChoice(promptItem) {
    if (!petBubble || !promptItem) return;
    petChoiceActive = true;
    window.clearTimeout(petBubbleTimer);
    petBubble.classList.add("is-visible", "has-choice");
    petBubble.innerHTML = `
      <div class="pet__ask-text">${esc(promptItem.question)}</div>
      <div class="pet__ask-actions">
        <button type="button" class="pet__ask-btn pet__ask-btn--yes" data-pet-choice="yes">yes! ✨</button>
        <button type="button" class="pet__ask-btn pet__ask-btn--no" data-pet-choice="no">no</button>
      </div>
    `;

    // Auto-dismiss after 14s if ignored
    petBubbleTimer = window.setTimeout(() => {
      if (!petChoiceActive) return;
      petChoiceActive = false;
      petBubble.classList.remove("is-visible", "has-choice");
    }, 14000);
  }

  petBubble?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pet-choice]");
    if (!btn) return;
    e.stopPropagation();
    const choice = btn.dataset.petChoice;
    const currentPrompt = PET_TELEPORT_PROMPTS[lastPromptIdx] || PET_TELEPORT_PROMPTS[0];
    petChoiceActive = false;
    petBubble.classList.remove("has-choice");

    if (choice === "yes" && currentPrompt) {
      playSfx("coin");
      updatePetHappyUI(8);
      triggerPetBounce();
      if (petStage) {
        const r = petStage.getBoundingClientRect();
        spawnHeartShower(r.left + r.width / 2, r.top + r.height / 3, 12);
      }
      currentPrompt.act?.();
      if (currentPrompt.act !== feedPet) {
        petSay(currentPrompt.yesReply || "yay!! let's go! ✨", 3400);
      }
    } else {
      playSfx("pop");
      petSay(petPick(PET_NO_REPLIES), 2600);
    }
    scheduleNextPetTeleport(16000 + Math.random() * 9000);
  });

  function scheduleNextPetTeleport(delayMs) {
    window.clearTimeout(petTeleportTimer);
    if (petIsMad) return;
    const wait = delayMs ?? (16000 + Math.random() * 10000);
    petTeleportTimer = window.setTimeout(() => {
      if (petIsMad) return;
      if (petChatOpen || document.hidden || petChoiceActive) {
        scheduleNextPetTeleport(8000);
        return;
      }
      teleportPetWithPrompt();
    }, wait);
  }

  function teleportPetWithPrompt() {
    if (!petStage || petChatOpen || petIsMad) return;
    if (isChessWindowOpen()) {
      nudgePetOutsideChessWindow();
      scheduleNextPetTeleport(12000);
      return;
    }
    petStopWalk();
    petBusy = true;

    // 1. Departure VFX at current position
    const oldRect = (petAnimWrap || petStage).getBoundingClientRect();
    spawnTeleportVfx(oldRect.left + oldRect.width / 2, oldRect.top + oldRect.height / 2);
    playSfx("powerup");

    if (petAnimWrap) {
      petAnimWrap.classList.remove("is-teleporting-in", "is-bouncing");
      petAnimWrap.classList.add("is-teleporting-out");
    }

    // 2. After 230ms warp-out, relocate left/right along the desktop taskbar floor (petY = 0)
    window.setTimeout(() => {
      const vw = window.innerWidth;
      const isPhone = vw <= 780;
      const minX = isPhone ? -Math.max(40, vw - 170) : -Math.max(80, vw - 290);
      const maxX = isPhone ? -28 : -16;

      let nextX = petX;
      for (let attempt = 0; attempt < 8; attempt++) {
        nextX = Math.round(minX + Math.random() * (maxX - minX));
        if (Math.abs(nextX - petX) > (isPhone ? 65 : 150)) break;
      }

      petX = nextX;
      petY = 0;
      petStage.style.transition = "none";
      petStage.style.transform = `translate3d(${petX}px, 0, 0)`;

      petPlay("action");
      if (petAnimWrap) {
        petAnimWrap.classList.remove("is-teleporting-out");
        petAnimWrap.classList.add("is-teleporting-in");
        window.setTimeout(() => petAnimWrap.classList.remove("is-teleporting-in"), 420);
      }

      // 3. Arrival VFX at new position + low (20%) chance to show a Yes/No suggestion bubble
      const newRect = (petAnimWrap || petStage).getBoundingClientRect();
      spawnTeleportVfx(newRect.left + newRect.width / 2, newRect.top + newRect.height / 2);

      if (Math.random() < 0.2) {
        let idx = Math.floor(Math.random() * PET_TELEPORT_PROMPTS.length);
        if (idx === lastPromptIdx && PET_TELEPORT_PROMPTS.length > 1) {
          idx = (idx + 1) % PET_TELEPORT_PROMPTS.length;
        }
        lastPromptIdx = idx;
        petAskChoice(PET_TELEPORT_PROMPTS[idx]);
      } else {
        petChoiceActive = false;
        petBubble?.classList.remove("is-visible", "has-choice");
      }

      window.setTimeout(() => {
        petBusy = false;
      }, 450);

      scheduleNextPetTeleport(19000 + Math.random() * 9000);
    }, 230);
  }

  function petPlay(mood) {
    const src = petPick(petAnims(mood));
    const url = petSrc(src);
    if (!petImg || !url) return false;
    petImg.src = url;
    return true;
  }

  function petToIdle() {
    if (petIsMad) {
      setPetSilentStare();
      return;
    }
    petStopWalk();
    if (petAnimWrap) petAnimWrap.classList.remove("is-bouncing");
    if (petImg) petImg.classList.remove("is-bouncing");
    if (petStage) petStage.classList.remove("is-bouncing");
    petMoodCurrent = "idle";
    petBusy = false;
    window.clearTimeout(petIdleTimer);
    petIdleTimer = window.setTimeout(() => {
      if (petIsMad || petMoodCurrent !== "idle") return;
      if (petBusy || petChatOpen || document.hidden) return;
      goIdle();
    }, 6500 + Math.random() * 9500);
  }

  function goIdle() {
    if (petIsMad) {
      setPetSilentStare();
      return;
    }
    petToIdle();
    if (petPlay("idle")) {
      petBusy = true;
      window.setTimeout(() => { petBusy = false; }, 2400);
    }
  }

  function goWalk(dir) {
    if (isChessWindowOpen()) {
      petStopWalk();
      nudgePetOutsideChessWindow();
      return;
    }
    petMoodCurrent = "walk";
    window.clearTimeout(petIdleTimer);
    petStopWalk();
    petDir = dir;
    const step = () => {
      const el = petStage;
      const img = petImg;
      if (el && img) {
        const elRect = el.getBoundingClientRect();
        const stageW = img.offsetWidth || 56;
        const maxX = Math.max(0, elRect.width - stageW - 16);
        petX += petDir > 0 ? 5 : -5;
        if (petDir > 0 && petX > maxX) { petX = maxX; petDir = -1; }
        if (petDir < 0 && petX < -stageW + 6) { petX = -(stageW - 6); petDir = 1; }
        el.style.transform = `translateX(${petX}px)`;
      }
      petRAF = requestAnimationFrame(step);
    };
    petRAF = requestAnimationFrame(step);
  }

  function stopWalk() {
    cancelAnimationFrame(petRAF);
    petRAF = 0;
    if (petStage && petX === 0 && petY === 0) petStage.style.transform = "";
  }

  function headPat() {
    if (petIsMad || !finePointer || petBusy || petChatOpen || petChoiceActive) return;
    petStopWalk();
    petMoodCurrent = "headpat";
    petPlay("headpat");
    petBusy = true;
    petSay(petPick(petBubblesFor("pat")) || "pat pat ♡ best pats in the whole wide web");
    window.clearTimeout(petActionTimer);
    petActionTimer = window.setTimeout(() => { petBusy = false; petToIdle(); }, 900);
  }

  function poke() {
    if (petIsMad) {
      setPetSilentStare();
      pushMadCmdLine("[!] Wisteria is ignoring your pokes. She is just staring at you. Type \"give cookies\" or \"give ram\".", "warn");
      $("#madCmdInput")?.focus();
      return;
    }
    if (petChatOpen) return;

    petPokeCount += 1;
    window.clearTimeout(petPokeDecayTimer);
    petPokeDecayTimer = window.setTimeout(() => {
      if (!petIsMad) {
        petPokeCount = 0;
        rampMusicPlaybackRate(1, 300);
      }
    }, 18000);

    updatePetHappyUI(-15);

    // 5th poke snaps Wisteria into full Mad Mode!
    if (petPokeCount >= 5) {
      triggerPetMadMode({ fromReload: false });
      return;
    }

    petStopWalk();
    petMoodCurrent = "poke";
    petPlay("poke");
    triggerPetBounce();
    petBusy = true;

    if (petPokeCount === 3) {
      playSfx("error");
      document.body.classList.remove("is-wisteria-poke-warn");
      void document.body.offsetWidth;
      document.body.classList.add("is-wisteria-poke-warn");
      petSay("hey!! i'm serious... stop poking me or i'll get really mad!!", 3200);
    } else if (petPokeCount === 4) {
      playSfx("error");
      document.body.classList.remove("is-wisteria-poke-warn");
      void document.body.offsetWidth;
      document.body.classList.add("is-wisteria-poke-warn");
      if (petImg) petImg.src = petSrc(PET_MAD_STARE_SPRITE);
      rampMusicPlaybackRate(0.84, 300);
      petSay("FINAL WARNING. one more poke and i'm deleting your desktop.", 3600);
    } else {
      petSay(petPick(petBubblesFor("poke")) || "stop poking me!!");
    }

    window.clearTimeout(petActionTimer);
    petActionTimer = window.setTimeout(() => {
      if (petIsMad) return;
      petBusy = false;
      petToIdle();
    }, 1300);
  }

  function petChatty() {
    if (petIsMad) return;
    if (petBusy || petChatOpen || document.hidden || petChoiceActive) {
      petChattyTimer = window.setTimeout(petChatty, 14000);
      return;
    }
    petMoodCurrent = "talk";
    petPlay("talk");
    petBusy = true;
    petSay(petPick(petBubblesFor("talk")) || "did you know i once talked a whole weekend away?");
    window.setTimeout(() => { petBusy = false; petToIdle(); }, 2400);
    petChattyTimer = window.setTimeout(petChatty, 26000 + Math.random() * 22000);
  }

  function petActAndRoute(target) {
    petMoodCurrent = "action";
    petPlay("action");
    petBusy = true;
    petSay(petPick(petBubblesFor("action")) || "ooh! ooh! show me something!!");
    window.setTimeout(() => {
      petBusy = false;
      petToIdle();
      if (target && target.kind === "project" && target.id) openProject(target.id);
      else if (target && target.kind === "art") {
        const el = document.querySelector("#media");
        if (el) el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      } else if (target && target.kind === "social") {
        const social = (config.socials || []).find((item) => item.id === target.id);
        if (social && social.url) window.open(social.url, "_blank", "noopener");
      }
    }, 1500);
  }

  const petProjectProfiles = {
    wisp: {
      id: "wisp",
      title: "Wisp",
      subtitle: "Purple pixel download manager, BitTorrent + extension",
      desc: "Wisp is Kurizu's open-source purple pixel Windows download manager built with Tauri 2 + Rust! It splits downloads across up to 16 parallel workers, supports native BitTorrent & magnet links, downloads YouTube + 1,000+ sites via yt-dlp, runs in Midnight dark mode & the system tray, and pairs with auto-intercept Chrome/Edge/Brave & Firefox extensions.\n\n✨ Grab the Windows installer, Chrome/Edge or Firefox extension .zip, or GitHub source right from wisp.exe!",
    },
    aipet: {
      id: "aipet",
      title: "AIPet",
      subtitle: "Desktop virtual pet",
      desc: "A transparent, always-on-top desktop companion for Windows! Drop in your own GIF, WebP or PNG sprites for every mood, then drag it around, pet it, and listen to it ramble in a speech bubble. It remembers its position, settings and happiness between launches, and hides in the tray when you need to focus.\n\n✨ Built with Tauri v2 + Rust — no bundled Chromium!",
    },
    pixify: {
      id: "pixify",
      title: "KURIZU.pixify",
      subtitle: "Pixel art cleaner + vectorizer",
      desc: "A browser-only cleanup tool for AI-generated pixel art, plus a raster-to-SVG vectorizer. It detects the pixel grid with two independent estimators, samples cells, quantizes the palette, and cleans up stray pixels and holes.\n\n✨ Runs 100% locally in your browser — your images never leave your device!",
    },
    wobble: {
      id: "wobble",
      title: "Wobble Studio",
      subtitle: "Paint-on motion animator",
      desc: "Wobble Studio turns a still drawing into a looping animation by painting motion onto it! Every paint colour gets its own motion preset (sway, jiggle, breathe, flutter, flame, ripple, and more). The renderer uses a soft rubber-sheet pull weight on WebGL2 instead of hard cut-outs.\n\n✨ Pseudo-Live2D without complex rigging!",
    },
    malfoy: {
      id: "malfoy",
      title: "Malfoy.exe",
      subtitle: "Harry Potter–inspired desktop prank",
      desc: "A Harry Potter–inspired desktop prank shipped as a Windows app. A little white-haired gremlin walks onto your desktop, waves, insults you, then 'takes your PC': the screen melts, fake cmd windows claim to delete System32, and a fake BSOD rolls into a fake shutdown.\n\n✨ Don't worry, nothing is actually deleted! Type 'i love you malfoid' anywhere to stop it, or tap DELETE three times.",
    },
    "forest-run": {
      id: "forest-run",
      title: "Do Not Stop — Forest Run",
      subtitle: "Browser endless runner",
      desc: "A Three.js endless runner built around a single shrinking momentum bar! You sprint down a low-poly purple trail in three lanes, jumping fallen logs, sliding under branches, dodging stumps and hopping pits while collecting golden ram coins to keep your momentum alive before the creature behind catches up.\n\n✨ Playable directly in your browser with Web Audio chiptunes!",
    },
    "ai-blocker": {
      id: "ai-blocker",
      title: "AI Blocker",
      subtitle: "Browser extension",
      desc: "A Manifest V3 Chrome/Brave extension that hides AI buttons, overviews, sidebars, and assistants across Google, YouTube, Reddit, X and more. It blocks third-party requests to known AI APIs with a global switch and per-site allowlist, while leaving tools you intentionally open usable.\n\n✨ Keeps your search feeds clean and AI-free!",
    },
    "dns-changer": {
      id: "dns-changer",
      title: "DNS Changer PH",
      subtitle: "Android app",
      desc: "A lightweight, no-root Kotlin app for Philippine networks that routes only DNS through a local VPN (Cloudflare, Google, Quad9) to unblock Discord and sites without slowing down your traffic!",
    },
  };

  function resolvePetCommand(raw) {
    const q = (raw || "").trim().toLowerCase();
    if (!q) return null;
    const testRegex = (re) => re.test(q);

    // 1. Greetings
    if (testRegex(/^(hi+|hello+|hey+|heyy+|heya|hewwo|yo+|sup|hiya|howdy|good\s*(morning|afternoon|evening))\b/i) || testRegex(/\b(say\s*hi|say\s*hello)\b/i)) {
      const list = (config.pet && config.pet.dialogue && config.pet.dialogue.greetings) || [
        "hewwo! (•ᴗ•)ﾉ wisteria at your service! happy you stopped by my corner of the web ♡",
        "hi hi human! did you come here to give me headpats or check out Kurizu's projects? (˶ᵔ ᵕ ᵔ˶)",
        "yooo! wisteria's online, vibes are at 100%, and ready to chat! what's on your mind?",
        "hey there! don't forget to poke me on the desktop so i can do my bouncy jump! ✨",
        "hello hello! welcome to kurizu.exe! ask me anything about the projects or just vibe with me ♡",
      ];
      return { kind: "chat", reply: petPick(list) };
    }

    // 2. How are you
    if (testRegex(/\b(how\s*(are|r)\s*(you|u)|how's\s*it\s*going|hows\s*it\s*going|what'?s\s*up|wassup)\b/i)) {
      const list = (config.pet && config.pet.dialogue && config.pet.dialogue.howAreYou) || [
        "i'm doing wonderful! vibing on the taskbar, dodging bugs, and soaking in all the purple pixels ♡",
        "feeling bouncy and full of energy! (•̀ᴗ•́)و how are you doing today, human?",
        "living my best gremlin life! 100% vibes, zero frameworks harmed. what about you?",
      ];
      return { kind: "chat", reply: petPick(list) };
    }

    // 3. Who are you / Identity
    if (testRegex(/\b(who\s*(are|r)\s*(you|u)|what\s*(are|r)\s*(you|u)|your\s*name|what('?s|\s+is)\s+your\s+name)\b/i)) {
      return {
        kind: "chat",
        reply: (config.pet && config.pet.dialogue && config.pet.dialogue.whoAreYou) ||
          "i'm Wisteria! Kurizu's purple desktop companion & resident gremlin mascot ♡ i live on this website, chat with visitors, bounce when poked, and show off cool projects!",
      };
    }

    // 4. Who is Kurizu / Creator
    if (testRegex(/\b(who\s*is\s*kurizu|who\s*made\s*(you|u)|who\s*created\s*(you|u)|about\s*kurizu|creator|developer)\b/i)) {
      return {
        kind: "chat",
        reply: (config.pet && config.pet.dialogue && config.pet.dialogue.whoIsKurizu) ||
          "Kurizu is a self-taught developer, designer & pixel collector from the Philippines! He builds desktop apps (like AIPet and Malfoy), creative tools (Pixify, Wobble Studio), pixel games, and this whole retro desktop website!",
      };
    }

    // 5. Love / Affection
    if (testRegex(/\b(i\s*love\s*(you|u)|love\s*(you|u)|ily|<3|marry\s*me)\b/i)) {
      return {
        kind: "chat",
        reply: (config.pet && config.pet.dialogue && config.pet.dialogue.love) ||
          "waaah! ♡ (⸝⸝ᴗ﹏ᴗ⸝⸝) my pixels are blushing! wait... is this the secret passphrase to shut down Malfoy.exe or do you really mean it? either way, headpats accepted!",
      };
    }

    // 6. Cute / Praise
    if (testRegex(/\b(cute|so\s*cute|adorable|pretty|kawaii)\b/i)) {
      return {
        kind: "chat",
        reply: (config.pet && config.pet.dialogue && config.pet.dialogue.cute) ||
          "hehe thank you!! (´｡• ᵕ •｡`) purple gremlins have the most charisma, it's scientifically verified by Kurizu!",
      };
    }

    // 7. Thanks
    if (testRegex(/\b(thank\s*(you|u)|thanks|thx|ty|arigato)\b/i)) {
      return {
        kind: "chat",
        reply: (config.pet && config.pet.dialogue && config.pet.dialogue.thanks) ||
          "you're very welcome! (•̀ᴗ•́)و wisteria's always happy to help. you can tip me in ram coins and headpats!",
      };
    }

    // 8. Bye / Goodnight
    if (testRegex(/\b(bye|goodbye|see\s*(ya|you)|cya|good\s*night|goodnight|gn|farewell)\b/i)) {
      return {
        kind: "chat",
        reply: (config.pet && config.pet.dialogue && config.pet.dialogue.bye) ||
          "bye bye! don't be a stranger, come back and poke me again soon~ ♡ (•ᴗ•)ﾉ",
      };
    }

    // 9. Poke / Bounce
    if (testRegex(/\b(bounce|poke|jump|boing)\b/i)) {
      triggerPetBounce();
      return {
        kind: "chat",
        reply: (config.pet && config.pet.dialogue && config.pet.dialogue.bounce) ||
          "boing!! if you poke me directly on my desktop sprite, i'll do a big bouncy jump into the sky for you! ✨ try clicking me!",
      };
    }

    // 10. Headpat
    if (testRegex(/\b(headpat|pat|pet)\b/i)) {
      updatePetHappyUI(5);
      return {
        kind: "chat",
        reply: (config.pet && config.pet.dialogue && config.pet.dialogue.pat) ||
          "soft hands only! headpats give me +100 happiness and keep my mischievous gremlin side under control ♡",
      };
    }

    // 10b. Feed / Snack
    if (testRegex(/\b(feed|cookie|snack|treat|eat|food)\b/i)) {
      updatePetHappyUI(15);
      playSfx("powerup");
      return {
        kind: "chat",
        reply: `nom nom nom!! 🍪 pixel cookie devoured! my happiness is now at ${petHappiness}%! best human ever ♡`,
      };
    }

    // 11. Help / Commands
    if (testRegex(/\b(help|commands|what\s*can\s*(you|u)\s*do|options|menu)\b/i)) {
      return {
        kind: "chat",
        reply: "here's what you can ask me:\n• Say 'hi' or 'how are you'\n• Ask: 'tell me about AIPET', 'pixify', 'wobble studio', 'malfoy exe', 'do not stop game', or 'ai blocker'\n• Ask 'who is kurizu' or 'who are you'\n• Ask for socials like 'github' or 'instagram'\n• Type 'open <project>' to open its case study in the work browser!",
      };
    }

    // 12. Social media
    const socialMap = [
      ["instagram", "instagram"],
      ["github", "github"],
      ["youtube", "youtube"],
      ["tiktok", "tiktok"],
    ];
    for (const [word, id] of socialMap) {
      if (q.includes(word)) {
        const social = (config.socials || []).find((item) => item.id === id);
        return {
          kind: "social",
          id,
          route: testRegex(/\b(open|visit|link|go\s*to)\b/i),
          reply: `that's ${social ? social.label : id} — ${social ? social.handle : ""}. i'm not the boss of you, but go say hi! ✨`,
        };
      }
    }

    // 13. Art / Gallery
    if (testRegex(/\b(art|gallery|drawing|drawings|sketches|media)\b/i)) {
      return {
        kind: "art",
        route: testRegex(/\b(open|show|scroll|go)\b/i),
        reply: "the art lives over at the media bay — digital illustrations, pixel sprites, and the showreel! scroll down to take a peek ✨",
      };
    }

    // 13b. Let Wisteria play Into the Forest herself!
    if (
      testRegex(/\b(play|watch|demo|auto)\b.*\b(forest|into\s*the\s*forest|game|runner|arcade)\b/i) ||
      testRegex(/\b(play\s+(?:by\s+)?yourself|play\s+it\s+yourself|let\s+you\s+play|wisteria\s+play)\b/i)
    ) {
      openGameWithWisteria("story");
      return {
        kind: "chat",
        reply: "say less!! booting up forest_run.exe and taking the controls myself! watch my lane dodges (you can press any key anytime to take over) 🐾✨",
      };
    }

    // Chess vs Wisteria
    if (/\bchess\b/i.test(raw)) {
      if (petSay("opening wisteria_chess.exe!! I'll move the pieces with my actual 3D hands!! ♟️✨", 3600)) {
        openDesktopWindow("chess");
      }
      return "♟️ Let's play! Launching **Wisteria 3D Chess** (`chess.exe`) — pick **Easy**, **Medium**, **Hard**, or **Grandmaster** and face me across the board!";
    }

    // 14. Projects (AIPET, pixify, wobble, malfoy, forest run, ai blocker, etc.)
    const wantsOpen = testRegex(/\b(open|launch|play|view|show\s*me)\b/i);

    const projectKeys = [
      { key: "aipet", regex: /\b(aipet|ai\s*pet|virtual\s*pet|desktop\s*pet)\b/i },
      { key: "pixify", regex: /\b(pixify|pixel\s*clean|cleaner|vectorizer|vectorize)\b/i },
      { key: "wobble", regex: /\b(wobble|wobble\s*studio)\b/i },
      { key: "malfoy", regex: /\b(malfoy|malfoid|malfoy\.exe|virus|prank)\b/i },
      { key: "forest-run", regex: /\b(do\s*not\s*stop|forest\s*run|endless\s*runner|runner\s*game|arcade\s*game)\b/i },
      { key: "ai-blocker", regex: /\b(ai\s*blocker|blocker\s*extension)\b/i },
      { key: "dns-changer", regex: /\b(dns\s*changer|dns)\b/i },
    ];

    for (const item of projectKeys) {
      if (item.regex.test(q)) {
        const profile = petProjectProfiles[item.key];
        if (profile) {
          if (wantsOpen) {
            return {
              kind: "project",
              id: item.key,
              route: true,
              reply: `opening ${profile.title} for you in the work browser! ✨`,
            };
          }
          return {
            kind: "project",
            id: item.key,
            route: false,
            reply: `✨ **${profile.title}** (${profile.subtitle}):\n\n${profile.desc}\n\n*(Type "open ${profile.title}" if you'd like to inspect the full case study!)*`,
          };
        }
      }
    }

    // Fallback search across all config.projects
    const matchedProject = (config.projects || []).find((p) => {
      const title = (p.title || "").toLowerCase();
      const id = (p.id || "").toLowerCase();
      return q.includes(id) || q.includes(title);
    });
    if (matchedProject) {
      if (wantsOpen) {
        return {
          kind: "project",
          id: matchedProject.id,
          route: true,
          reply: `opening ${matchedProject.title} for you! ✨`,
        };
      }
      return {
        kind: "project",
        id: matchedProject.id,
        route: false,
        reply: `✨ **${matchedProject.title}** (${matchedProject.subtitle || matchedProject.categoryLabel || ""}):\n\n${matchedProject.description || matchedProject.blurb}`,
      };
    }

    return null;
  }

  function petPickFact() {
    const facts = (config.pet && config.pet.facts) || [];
    return facts.length ? facts[Math.floor(Math.random() * facts.length)] : "i vibed really hard today.";
  }

  function sendPetChat(raw) {
    const value = (raw || "").trim();
    if (!value) return;
    if (petChatInput) petChatInput.value = "";
    chatPush("user", value);
    const target = resolvePetCommand(value);
    if (target) {
      chatPush("bot", target.reply);
      if (target.route) {
        petActAndRoute(target);
      }
    } else {
      chatPush("bot", petPickFact());
      petChatty();
    }
  }

  function chatPush(kind, text) {
    if (!petChatLog) return;
    const el = document.createElement("div");
    el.className = "pet-chat__msg " + (kind === "user" ? "pet-chat__msg--user" : "pet-chat__msg--bot");
    el.textContent = text;
    petChatLog.appendChild(el);
    petChatLog.scrollTop = petChatLog.scrollHeight;
  }

  function chatOpen() {
    if (petIsMad) {
      playSfx("error");
      pushMadCmdLine("[WISTERIA] \"...\" (She refuses to open chat or talk to you. Type \"give cookies\" or \"give ram\" in cmd.exe.)", "warn");
      $("#madCmdInput")?.focus();
      return;
    }
    if (!petChat) return;
    petChatOpen = true;
    petChat.hidden = false;
    if (petChatToggle) petChatToggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("pet-chat-open");
    petStopTimers();
    stopWalk();
    if (petChatLog) petChatLog.innerHTML = "";
    chatPush("bot", (config.pet && config.pet.greeting) || "hi!! i'm wisteria ♡ ask me anything (no ai, just vibes, lots of purple).");
    if (petChatInput) petChatInput.focus();
  }

  function chatClose() {
    if (!petChat) return;
    petChatOpen = false;
    petChat.hidden = true;
    if (petChatToggle) petChatToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("pet-chat-open");
    petStopTimers();
    stopWalk();
    petToIdle();
  }

  petChatToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    if (petChatOpen) chatClose();
    else chatOpen();
  });

  const helpTooltip = $("#helpTooltip");
  if (window.SakugaFX) {
    if (window.SakugaFX.P) {
      Object.assign(window.SakugaFX.P, {
        fill: "#fff8ff",
        shade: "#dcc4f7",
        line: "#2f0a44",
        accent: "#ff4fa0",
        ink: "#2f0a44",
        sfx: ["#2f0a44", "#fff8ff"]
      });
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery?.matches) {
      motionQuery.dispatchEvent(Object.assign(new Event("change"), { matches: false }));
    }
  }
  helpTooltip?.addEventListener("click", () => {
    helpTooltip.hide?.();
    chatOpen();
  });

  const paypalUrl = config.paypal || "https://paypal.me/KurizuDev";
  const donateButtons = $$("sakuga-button[data-donate], #donateBtn, #contactDonateBtn");
  donateButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.done?.(2.5);
      window.setTimeout(() => {
        window.open(paypalUrl, "_blank", "noopener,noreferrer");
      }, 350);
    });
  });

  petChat?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-chat]")) chatClose();
    const chip = event.target.closest("[data-pet-ask]");
    if (chip) {
      sendPetChat(chip.dataset.petAsk);
    }
  });

  petChatForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendPetChat(petChatInput ? petChatInput.value : "");
  });

  if (petStage) {
    let petDragging = false;
    let petMoved = false;
    let activePetPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let basePetX = 0;
    let basePetY = 0;
    let gravityRAF = 0;

    function applyPetTransform() {
      petStage.style.transform = `translate3d(${Math.round(petX)}px, ${Math.round(petY)}px, 0)`;
    }

    function dropPetWithGravity() {
      cancelAnimationFrame(gravityRAF);
      let vy = 0;
      const gravity = 1.65;
      const bounceFactor = -0.36;

      const stepGravity = () => {
        if (petY < 0) {
          vy += gravity;
          petY += vy;
          if (petY >= 0) {
            petY = 0;
            if (Math.abs(vy) > 4.5) {
              vy *= bounceFactor;
              playSfx("pop");
            } else {
              vy = 0;
            }
          }
          applyPetTransform();
          if (petY < 0 || Math.abs(vy) > 0.5) {
            gravityRAF = requestAnimationFrame(stepGravity);
            return;
          }
        }
        petY = 0;
        applyPetTransform();
        triggerPetBounce();
        petSay("wheee! safe landing ♡");
      };

      if (petY < 0) {
        petStage.style.transition = "none";
        gravityRAF = requestAnimationFrame(stepGravity);
      } else {
        petY = 0;
        applyPetTransform();
      }
    }

    petStage.addEventListener("pointerenter", () => {
      if (finePointer && !petBusy && !petDragging && !petChoiceActive) {
        updatePetHappyUI(2);
        headPat();
      }
    });

    petStage.addEventListener("pointerdown", (event) => {
      if (event.target.closest("#petFeedBtn, #petBubble")) return;
      if (petDragging) return;
      event.preventDefault();
      if (petIsMad) {
        poke();
        return;
      }
      cancelAnimationFrame(gravityRAF);
      petDragging = true;
      petMoved = false;
      activePetPointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      basePetX = petX;
      basePetY = petY;
      petStage.style.transition = "none";
      try { petStage.setPointerCapture(event.pointerId); } catch (_) {}
    });

    petStage.addEventListener("touchmove", (event) => {
      if (petDragging) event.preventDefault();
    }, { passive: false });

    window.addEventListener("pointermove", (event) => {
      if (!petDragging || (activePetPointerId !== null && event.pointerId !== activePetPointerId)) return;
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      if (!petMoved && Math.hypot(dx, dy) > 7) {
        petMoved = true;
        petStopWalk();
        petBusy = true;
        petPlay("action");
        petSay("woah!! where are we flying?!");
      }
      if (petMoved) {
        const stageRect = petStage.getBoundingClientRect();
        const stageW = Math.max(72, stageRect.width || 110);
        const stageH = Math.max(96, stageRect.height || 140);
        const minX = -(window.innerWidth - stageW - 12);
        const minY = -Math.max(80, window.innerHeight - stageH - 70);
        petX = Math.max(minX, Math.min(12, basePetX + dx));
        petY = Math.min(0, Math.max(minY, basePetY + dy));
        applyPetTransform();
      }
    });

    const endPetPointer = (event) => {
      if (!petDragging || (activePetPointerId !== null && event.pointerId !== activePetPointerId)) return;
      const pointerId = activePetPointerId;
      activePetPointerId = null;
      petDragging = false;
      try { if (pointerId !== null) petStage.releasePointerCapture(pointerId); } catch (_) {}
      if (petMoved) {
        petBusy = false;
        dropPetWithGravity();
      } else {
        petStage.style.transition = "";
        poke();
      }
    };

    window.addEventListener("pointerup", endPetPointer);
    window.addEventListener("pointercancel", endPetPointer);
    petStage.addEventListener("click", (event) => {
      if (!event.target.closest("#petFeedBtn, #petBubble")) event.preventDefault();
    });
    petStage.addEventListener("dblclick", (event) => {
      if (event.target.closest("#petFeedBtn, #petBubble")) return;
      teleportPetWithPrompt();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (petChatOpen) chatClose();
  });

  function initPet() {
    if (petIsMad) {
      triggerPetMadMode({ fromReload: true });
      return;
    }
    goIdle();
    petChatty();
    scheduleNextPetTeleport(5500);
  }

  if (petRoot) initPet();

  /* ============================================================
     PROJECT STAR RATINGS, COMMENTS, REPLIES, SORTING & KURIZU OPERATOR GATE
     ============================================================ */
  const REVIEWS_API = window.KURIZU_REVIEWS_API || "https://kurizu-game-server.onrender.com/api/reviews";
  const ADMIN_API_BASE = REVIEWS_API.replace(/\/api\/reviews\/?$/, "/api/admin");
  const REVIEWS_CACHE_KEY = "kurizu_reviews_cache_v1";
  const REVIEWER_NAME_KEY = "kurizu_reviewer_name";
  const REVIEWER_CID_KEY = "kurizu_client_id";
  const OP_SESSION_KEY = "kurizu_op_session_v1";
  const OP_LOCK_KEY = "kurizu_op_lock_v1";
  const OPERATOR_HASH_SPEC =
    "pbkdf2_sha256$310000$55a8f83169ae893b5dad6f03fa246b58$7cbc55208c357e1fdf0d17e5684115aefae903d5f683fdded84ff02fa56a2d11";
  const OP_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
  const OP_LOCK_MAX_FAILS = 5;
  const OP_LOCK_DURATION_MS = 15 * 60 * 1000;

  let activeReviewRefresh = null;

  function loadOpSession() {
    try {
      const raw = window.sessionStorage?.getItem(OP_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.expiresAt || parsed.expiresAt <= Date.now()) {
        window.sessionStorage?.removeItem(OP_SESSION_KEY);
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function saveOpSession(session) {
    try {
      window.sessionStorage?.setItem(OP_SESSION_KEY, JSON.stringify(session));
    } catch (_) {}
  }

  function clearOpSession() {
    try {
      window.sessionStorage?.removeItem(OP_SESSION_KEY);
    } catch (_) {}
  }

  function isOperatorLoggedIn() {
    return Boolean(loadOpSession());
  }

  function getOpAuthHeaders() {
    const sess = loadOpSession();
    if (!sess || !sess.token || sess.mode !== "server") return {};
    return { Authorization: `Bearer ${sess.token}` };
  }

  function loadOpLockState() {
    try {
      const raw = window.localStorage?.getItem(OP_LOCK_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        fails: Number(parsed?.fails || 0),
        lockedUntil: Number(parsed?.lockedUntil || 0),
      };
    } catch (_) {
      return { fails: 0, lockedUntil: 0 };
    }
  }

  function saveOpLockState(state) {
    try {
      window.localStorage?.setItem(OP_LOCK_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function clearOpLockState() {
    try {
      window.localStorage?.removeItem(OP_LOCK_KEY);
    } catch (_) {}
  }

  function recordOpFailure(retryAfterSec = 0) {
    const now = Date.now();
    const cur = loadOpLockState();
    const fails = cur.fails + 1;
    let lockedUntil = cur.lockedUntil;
    if (retryAfterSec > 0) {
      lockedUntil = Math.max(lockedUntil, now + retryAfterSec * 1000);
    } else if (fails >= OP_LOCK_MAX_FAILS) {
      lockedUntil = now + OP_LOCK_DURATION_MS;
    }
    saveOpLockState({ fails, lockedUntil });
    return { fails, lockedUntil, remaining: Math.max(0, OP_LOCK_MAX_FAILS - fails) };
  }

  async function verifyPasswordLocalPBKDF2(password) {
    if (typeof password !== "string" || !password || !window.crypto?.subtle) return false;
    const parts = OPERATOR_HASH_SPEC.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expectedHex = parts[3];
    const enc = new TextEncoder();
    const keyMat = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedBuf = await window.crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
      keyMat,
      (expectedHex.length / 2) * 8
    );
    const actual = new Uint8Array(derivedBuf);
    const expected = new Uint8Array(expectedHex.length / 2);
    for (let i = 0; i < expected.length; i++) {
      expected[i] = parseInt(expectedHex.slice(i * 2, i * 2 + 2), 16);
    }
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  }

  async function attemptOperatorLogin(password) {
    const now = Date.now();
    const lock = loadOpLockState();
    if (lock.lockedUntil > now) {
      const waitSec = Math.max(1, Math.ceil((lock.lockedUntil - now) / 1000));
      return { ok: false, locked: true, error: `too many tries! wait ${Math.ceil(waitSec / 60)}m before retrying.` };
    }

    let serverResponded = false;
    try {
      const res = await fetch(`${ADMIN_API_BASE}/login`, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status !== 404) {
        serverResponded = true;
        const data = await res.json().catch(() => ({}));
        if (res.ok && data && data.ok && data.token) {
          clearOpLockState();
          saveOpSession({
            token: data.token,
            mode: "server",
            expiresAt: Number(data.expiresAt || Date.now() + OP_SESSION_TTL_MS),
          });
          applyOperatorUiState();
          return { ok: true, mode: "server" };
        }
        const failInfo = recordOpFailure(Number(data?.retryAfterSec || 0));
        if (res.status === 429) {
          return { ok: false, locked: true, error: data?.error || "Too many attempts. Locked temporarily." };
        }
        return {
          ok: false,
          error: failInfo.remaining > 0
            ? `wrong passphrase! (${failInfo.remaining} tries left)`
            : "too many failed tries — locked for 15 minutes.",
        };
      }
    } catch (_) {
      serverResponded = false;
    }

    if (!serverResponded) {
      const ok = await verifyPasswordLocalPBKDF2(password);
      if (ok) {
        clearOpLockState();
        saveOpSession({
          token: "local",
          mode: "local",
          expiresAt: Date.now() + OP_SESSION_TTL_MS,
        });
        applyOperatorUiState();
        return { ok: true, mode: "local" };
      }
      const failInfo = recordOpFailure(0);
      return {
        ok: false,
        error: failInfo.remaining > 0
          ? `wrong passphrase! (${failInfo.remaining} tries left)`
          : "too many failed tries — locked for 15 minutes.",
      };
    }

    return { ok: false, error: "could not verify passphrase." };
  }

  async function logoutOperator() {
    const sess = loadOpSession();
    if (sess && sess.mode === "server" && sess.token) {
      try {
        await fetch(`${ADMIN_API_BASE}/logout`, {
          method: "POST",
          mode: "cors",
          headers: { Authorization: `Bearer ${sess.token}` },
        });
      } catch (_) {}
    }
    clearOpSession();
    applyOperatorUiState();
  }

  function applyOperatorUiState() {
    const sess = loadOpSession();
    const active = Boolean(sess);
    document.body.classList.toggle("is-kurizu-operator", active);
    const badge = $("#startOpBadge");
    if (badge) badge.hidden = !active;
    const profileBadge = $("#profileAdminBadge");
    if (profileBadge) profileBadge.hidden = !active;

    const authView = $("#kurizuGateAuthView");
    const sessView = $("#kurizuGateSessionView");
    const modeEl = $("#kurizuGateMode");
    if (authView) authView.hidden = active;
    if (sessView) sessView.hidden = !active;
    if (modeEl && sess) {
      modeEl.textContent = sess.mode === "server"
        ? "verified operator session · synced with server"
        : "local operator session · offline/cache mode";
    }

    if (typeof activeReviewRefresh === "function") {
      activeReviewRefresh();
    }
  }

  function verifyStoredOperatorSession() {
    const sess = loadOpSession();
    if (!sess) {
      applyOperatorUiState();
      return;
    }
    applyOperatorUiState();
    if (sess.mode === "server" && sess.token) {
      fetch(`${ADMIN_API_BASE}/verify`, {
        mode: "cors",
        headers: { Authorization: `Bearer ${sess.token}` },
      })
        .then((res) => {
          if (res.status === 401) {
            clearOpSession();
            applyOperatorUiState();
          }
        })
        .catch(() => {});
    }
  }

  function initKurizuGate() {
    const trigger = $("#startSecretLoginTrigger");
    const gate = $("#kurizuGateDialog");
    const form = $("#kurizuGateForm");
    const pwdInput = $("#kurizuGatePassword");
    const eyeBtn = $("#kurizuGateEye");
    const errorEl = $("#kurizuGateError");
    const submitBtn = $("#kurizuGateSubmit");
    const logoutBtn = $("#kurizuLogoutBtn");
    const spriteEl = $("#kurizuGateSprite");
    const speechEl = $("#kurizuGateSpeech");
    const subEl = $("#kurizuGateSub");

    const SPRITE_ASK = "assets/Pet/idle animation/Idea.webp";
    const SPRITE_DENY = "assets/Pet/poke animation/SampleCharacter7_Hurt_2026-11-17-16-32-43.webp";

    function resetPromptText() {
      if (spriteEl) spriteEl.src = SPRITE_ASK;
      if (speechEl) speechEl.textContent = "are you kurizu?";
      if (subEl) subEl.textContent = "prove it to unlock operator controls ♡";
      if (errorEl) errorEl.textContent = "";
      if (pwdInput) {
        pwdInput.value = "";
        pwdInput.type = "password";
      }
      if (eyeBtn) {
        eyeBtn.textContent = "show";
        eyeBtn.setAttribute("aria-pressed", "false");
      }
    }

    trigger?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setStartMenu(false);
      resetPromptText();
      applyOperatorUiState();
      openDialog(gate);
      playSfx("pop");
      if (!isOperatorLoggedIn()) {
        window.setTimeout(() => pwdInput?.focus(), 60);
      }
    });

    gate?.addEventListener("close", () => {
      resetPromptText();
    });

    eyeBtn?.addEventListener("click", () => {
      if (!pwdInput) return;
      const reveal = pwdInput.type === "password";
      pwdInput.type = reveal ? "text" : "password";
      eyeBtn.textContent = reveal ? "hide" : "show";
      eyeBtn.setAttribute("aria-pressed", String(reveal));
      pwdInput.focus();
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!pwdInput) return;
      const candidate = pwdInput.value;
      pwdInput.value = "";
      if (!candidate) {
        if (errorEl) errorEl.textContent = "type the passphrase first ♡";
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (errorEl) errorEl.textContent = "checking…";

      const result = await attemptOperatorLogin(candidate);
      if (submitBtn) submitBtn.disabled = false;

      if (result.ok) {
        playSfx("powerup");
        toast("welcome back, kurizu! operator tools unlocked ★");
        gate?.close();
      } else {
        playSfx("error");
        if (spriteEl) spriteEl.src = SPRITE_DENY;
        if (speechEl) speechEl.textContent = "hmm... you're not kurizu!!";
        if (errorEl) errorEl.textContent = result.error || "wrong passphrase.";
        pwdInput.focus();
      }
    });

    logoutBtn?.addEventListener("click", async () => {
      await logoutOperator();
      playSfx("pop");
      toast("logged out of operator mode");
      gate?.close();
    });

    verifyStoredOperatorSession();
  }

  initKurizuGate();

  function getClientId() {
    try {
      let id = localStorage.getItem(REVIEWER_CID_KEY);
      if (!id) {
        id = "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        localStorage.setItem(REVIEWER_CID_KEY, id);
      }
      return id;
    } catch (_) {
      return "c_anon";
    }
  }

  function loadReviewCache() {
    try {
      return JSON.parse(localStorage.getItem(REVIEWS_CACHE_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveReviewCache(cache) {
    try {
      localStorage.setItem(REVIEWS_CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  function formatStarsStr(avg) {
    const rounded = Math.round(Number(avg) || 0);
    let s = "";
    for (let i = 1; i <= 5; i++) s += i <= rounded ? "★" : "☆";
    return s;
  }

  function formatTimeAgo(ts) {
    const diff = Math.max(0, Math.floor((Date.now() - Number(ts || 0)) / 1000));
    if (diff < 45) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function updateCardRatingBadge(projectId, summary) {
    const el = document.querySelector(`[data-rating-badge="${CSS.escape(projectId)}"]`);
    if (!el) return;
    const count = Number(summary?.count || 0);
    const avg = Number(summary?.avg || 0);
    const cCount = Number(summary?.commentsCount ?? (summary?.comments ? summary.comments.length : 0));
    if (count > 0) {
      el.textContent = `★ ${avg.toFixed(1)} (${count})${cCount ? ` · 💬 ${cCount}` : ""}`;
      el.classList.add("has-rating");
    } else if (cCount > 0) {
      el.textContent = `☆ rate · 💬 ${cCount}`;
      el.classList.remove("has-rating");
    } else {
      el.textContent = "☆ rate";
      el.classList.remove("has-rating");
    }
  }

  function normalizeCommentTag(tag) {
    return tag === "fixed" || tag === "not_fixed" ? tag : null;
  }

  function mergeReplies(srvReplies, locReplies, deletedReplySet) {
    const byKey = new Map();
    const seenIds = new Set();
    const list = [...(Array.isArray(srvReplies) ? srvReplies : []), ...(Array.isArray(locReplies) ? locReplies : [])];
    for (const r of list) {
      if (!r || !r.text) continue;
      if (r.id && deletedReplySet.has(r.id)) continue;
      const k = `${(r.name || "anonymous").trim().toLowerCase()}::${(r.text || "").trim().toLowerCase()}`;
      if (r.id && seenIds.has(r.id)) continue;
      if (byKey.has(k)) continue;
      if (r.id) seenIds.add(r.id);
      byKey.set(k, {
        id: r.id || "rep_" + Math.random().toString(36).slice(2, 8),
        name: r.name || "anonymous",
        text: r.text,
        ts: Number(r.ts || 0),
        isOperator: Boolean(r.isOperator),
      });
    }
    return Array.from(byKey.values()).sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
  }

  function mergeProjectReviews(localEntry, serverEntry) {
    const loc = localEntry || {};
    const srv = serverEntry || {};
    const locComments = Array.isArray(loc.comments) ? loc.comments : [];
    const srvComments = Array.isArray(srv.comments) ? srv.comments : [];

    const deletedSet = new Set([...(Array.isArray(srv.deletedIds) ? srv.deletedIds : []), ...(Array.isArray(loc.deletedIds) ? loc.deletedIds : [])]);
    const deletedReplySet = new Set([...(Array.isArray(srv.deletedReplyIds) ? srv.deletedReplyIds : []), ...(Array.isArray(loc.deletedReplyIds) ? loc.deletedReplyIds : [])]);

    // Deduplicate comments by id or (name + text) so local comments never vanish when Render restarts
    const byKey = new Map();
    const byId = new Map();
    const makeKey = (c) => `${(c.name || "anonymous").trim().toLowerCase()}::${(c.text || "").trim().toLowerCase()}`;

    srvComments.forEach((c) => {
      if (!c || !c.text) return;
      if (c.id && deletedSet.has(c.id)) return;
      const k = makeKey(c);
      const item = {
        ...c,
        tag: normalizeCommentTag(c.tag),
        isOperator: Boolean(c.isOperator),
        replies: mergeReplies(c.replies, [], deletedReplySet),
      };
      if (c.id) byId.set(c.id, item);
      byKey.set(k, item);
    });

    locComments.forEach((c) => {
      if (!c || !c.text) return;
      if (c.id && deletedSet.has(c.id)) return;
      const k = makeKey(c);
      const existing = (c.id && byId.get(c.id)) || byKey.get(k);
      if (existing) {
        if (existing.tag == null && c.tag) existing.tag = normalizeCommentTag(c.tag);
        existing.replies = mergeReplies(existing.replies, c.replies, deletedReplySet);
        return;
      }
      const item = {
        ...c,
        tag: normalizeCommentTag(c.tag),
        isOperator: Boolean(c.isOperator),
        replies: mergeReplies([], c.replies, deletedReplySet),
      };
      if (c.id) byId.set(c.id, item);
      byKey.set(k, item);
    });

    const mergedComments = Array.from(byKey.values()).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));

    const srvCount = Number(srv.count || 0);
    const locCount = Number(loc.count || 0);
    let count = Math.max(srvCount, locCount);
    let avg = srvCount >= locCount && srvCount > 0 ? Number(srv.avg || 0) : Number(loc.avg || 0);

    // If ratings exist on merged comments, make sure count is at least the number of rated comments
    const ratedComments = mergedComments.filter((c) => Number(c.rating) >= 1 && Number(c.rating) <= 5);
    if (ratedComments.length > count) {
      count = ratedComments.length;
      avg = +(ratedComments.reduce((sum, c) => sum + Number(c.rating), 0) / count).toFixed(1);
    }

    const commentsCount = mergedComments.length;

    return {
      avg,
      count,
      comments: mergedComments,
      commentsCount,
      myRating: Number(loc.myRating || srv.myRating || 0),
      deletedIds: Array.from(deletedSet).slice(0, 500),
      deletedReplyIds: Array.from(deletedReplySet).slice(0, 500),
    };
  }

  function resyncMissingReviewsToServer(projectId, localEntry, serverEntry) {
    const loc = localEntry || {};
    const srv = serverEntry || {};
    const deletedSet = new Set(Array.isArray(srv.deletedIds) ? srv.deletedIds : []);
    const locComments = Array.isArray(loc.comments) ? loc.comments : [];
    const srvComments = Array.isArray(srv.comments) ? srv.comments : [];
    const srvKeys = new Set(
      srvComments.map((c) => `${(c.name || "anonymous").trim().toLowerCase()}::${(c.text || "").trim().toLowerCase()}`)
    );
    const missingComments = locComments.filter(
      (c) =>
        c &&
        c.text &&
        !(c.id && deletedSet.has(c.id)) &&
        !srvKeys.has(`${(c.name || "anonymous").trim().toLowerCase()}::${(c.text || "").trim().toLowerCase()}`)
    );
    const hasMissingRating = Number(loc.myRating || 0) > 0 && Number(srv.count || 0) === 0;

    if (!missingComments.length && !hasMissingRating) return;

    fetch(REVIEWS_API, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: projectId,
        sync: true,
        clientId: getClientId(),
        rating: Number(loc.myRating || loc.avg || 0),
        syncComments: missingComments,
      }),
    }).catch(() => {});
  }

  function syncAllReviewSummaries() {
    const cache = loadReviewCache();
    Object.keys(cache).forEach((pid) => updateCardRatingBadge(pid, cache[pid]));

    fetch(REVIEWS_API, { mode: "cors" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.projects) return;
        const nextCache = loadReviewCache();
        const allPids = new Set([...Object.keys(nextCache), ...Object.keys(data.projects)]);
        allPids.forEach((pid) => {
          const localCur = nextCache[pid];
          const srvSum = data.projects[pid];
          nextCache[pid] = mergeProjectReviews(localCur, srvSum);
          updateCardRatingBadge(pid, nextCache[pid]);
          if (localCur && ((localCur.comments && localCur.comments.length) || localCur.myRating)) {
            if (!srvSum || Number(srvSum.commentsCount || 0) < (localCur.comments || []).length || Number(srvSum.count || 0) === 0) {
              resyncMissingReviewsToServer(pid, localCur, srvSum || {});
            }
          }
        });
        saveReviewCache(nextCache);
      })
      .catch(() => { /* offline or server waking up — local cache is already shown */ });
  }

  function sortComments(comments, sortKey = "newest") {
    const list = Array.isArray(comments) ? [...comments] : [];
    const tagRank = (tag) => (tag === "fixed" ? 2 : tag === "not_fixed" ? 1 : 0);
    list.sort((a, b) => {
      if (sortKey === "oldest") {
        return Number(a.ts || 0) - Number(b.ts || 0);
      }
      if (sortKey === "highest") {
        const diff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
        return diff !== 0 ? diff : Number(b.ts || 0) - Number(a.ts || 0);
      }
      if (sortKey === "lowest") {
        const ra = Number(a.rating) > 0 ? Number(a.rating) : 99;
        const rb = Number(b.rating) > 0 ? Number(b.rating) : 99;
        const diff = ra - rb;
        return diff !== 0 ? diff : Number(b.ts || 0) - Number(a.ts || 0);
      }
      if (sortKey === "most_replies") {
        const diff = (Array.isArray(b.replies) ? b.replies.length : 0) - (Array.isArray(a.replies) ? a.replies.length : 0);
        return diff !== 0 ? diff : Number(b.ts || 0) - Number(a.ts || 0);
      }
      if (sortKey === "status") {
        const diff = tagRank(b.tag) - tagRank(a.tag);
        return diff !== 0 ? diff : Number(b.ts || 0) - Number(a.ts || 0);
      }
      return Number(b.ts || 0) - Number(a.ts || 0);
    });
    return list;
  }

  function initCaseReviews(projectId) {
    const root = $("#caseReviews");
    if (!root) return;

    const avgEl = $("#caseReviewAvg", root);
    const starsDisp = $("#caseReviewStarsDisplay", root);
    const countEl = $("#caseReviewCount", root);
    const picker = $("#caseStarPicker", root);
    const starBtns = Array.from(picker ? picker.querySelectorAll(".star-picker__btn") : []);
    const starText = $("#caseStarText", root);
    const form = $("#caseReviewForm", root);
    const nameInput = $("#caseReviewName", root);
    const textInput = $("#caseReviewText", root);
    const charEl = $("#caseReviewChar", root);
    const statusEl = $("#caseReviewStatus", root);
    const submitBtn = $("#caseReviewSubmit", root);
    const listEl = $("#caseCommentsList", root);
    const sortSelect = $("#caseReviewSort", root);
    const toolbarInfoEl = $("#caseCommentsToolbarInfo", root);
    const adminIdentityEl = $("#caseReviewAdminIdentity", root);

    const STAR_LABELS = ["click a star", "1 / 5 · needs work", "2 / 5 · okay", "3 / 5 · pretty cool", "4 / 5 · love it!", "5 / 5 · masterpiece ★"];
    let selectedStar = 0;
    let currentSort = sortSelect?.value || "newest";
    let openReplyForId = null;
    const pendingDeletes = new Map(); // confirmKey -> timerId

    function syncReviewFormIdentity() {
      const isOp = isOperatorLoggedIn();
      if (adminIdentityEl) adminIdentityEl.hidden = !isOp;
      if (nameInput) nameInput.hidden = isOp;
    }

    try {
      const savedName = localStorage.getItem(REVIEWER_NAME_KEY);
      if (savedName && nameInput) nameInput.value = savedName;
    } catch (_) {}
    syncReviewFormIdentity();

    function paintStars(val) {
      starBtns.forEach((btn) => {
        const n = Number(btn.dataset.star);
        btn.classList.toggle("is-lit", n <= val);
        btn.setAttribute("aria-checked", String(n === selectedStar));
      });
      if (starText) starText.textContent = STAR_LABELS[val] || STAR_LABELS[0];
    }

    starBtns.forEach((btn) => {
      const n = Number(btn.dataset.star);
      btn.addEventListener("mouseenter", () => paintStars(n));
      btn.addEventListener("focus", () => paintStars(n));
      btn.addEventListener("click", () => {
        selectedStar = n;
        paintStars(selectedStar);
        if (typeof playUiSfx === "function") playUiSfx("pop");
      });
    });
    if (picker) {
      picker.addEventListener("mouseleave", () => paintStars(selectedStar));
    }

    if (textInput && charEl) {
      textInput.addEventListener("input", () => {
        charEl.textContent = `${textInput.value.length} / 400`;
      });
    }

    function getCurrentProjectData() {
      const c = loadReviewCache();
      return c[projectId] || { avg: 0, count: 0, comments: [], deletedIds: [], deletedReplyIds: [] };
    }

    function renderData(data) {
      syncReviewFormIdentity();
      const count = Number(data?.count || 0);
      const avg = Number(data?.avg || 0);
      const rawComments = Array.isArray(data?.comments) ? data.comments : [];
      const comments = sortComments(rawComments, currentSort);
      const isOp = isOperatorLoggedIn();

      if (avgEl) avgEl.textContent = count > 0 ? avg.toFixed(1) : "—";
      if (starsDisp) starsDisp.textContent = formatStarsStr(avg);
      if (countEl) {
        countEl.textContent = count > 0
          ? `${count} rating${count === 1 ? "" : "s"} · ${comments.length} comment${comments.length === 1 ? "" : "s"}`
          : (comments.length ? `${comments.length} comment${comments.length === 1 ? "" : "s"} · be the first to rate ♡` : "be the first to rate or comment ♡");
      }
      if (toolbarInfoEl) {
        const totalReplies = comments.reduce((acc, c) => acc + (Array.isArray(c.replies) ? c.replies.length : 0), 0);
        toolbarInfoEl.textContent = comments.length
          ? `${comments.length} comment${comments.length === 1 ? "" : "s"}${totalReplies ? ` · ${totalReplies} repl${totalReplies === 1 ? "y" : "ies"}` : ""}`
          : "comments";
      }

      updateCardRatingBadge(projectId, { avg, count, commentsCount: comments.length });

      if (!listEl) return;
      if (!comments.length) {
        listEl.innerHTML = `<p class="case-reviews__empty">no comments yet — drop the first thought below ♡</p>`;
        return;
      }

      let defaultReplyName = "";
      try {
        defaultReplyName = localStorage.getItem(REVIEWER_NAME_KEY) || "";
      } catch (_) {}
      if (!defaultReplyName && isOp) defaultReplyName = "kurizu";

      listEl.innerHTML = comments.map((c) => {
        const displayName = c.isOperator ? "kurizu" : (c.name || "anonymous");
        const initial = (String(displayName).trim()[0] || "A").toUpperCase();
        const avatarHtml = c.isOperator
          ? `<img class="review-item__avatar review-item__avatar--kurizu" src="assets/sprites/avatar-still.webp" alt="kurizu" width="32" height="32">`
          : `<span class="review-item__avatar" aria-hidden="true">${esc(initial)}</span>`;
        const rStars = c.rating >= 1 && c.rating <= 5
          ? `<span class="review-item__stars" aria-label="Rated ${c.rating} out of 5">${formatStarsStr(c.rating)}</span>`
          : "";
        const opAuthorBadge = c.isOperator ? `<span class="review-badge--op">★ admin</span>` : "";
        const statusBadge = c.tag === "fixed"
          ? `<span class="review-tag review-tag--fixed">✓ fixed</span>`
          : c.tag === "not_fixed"
            ? `<span class="review-tag review-tag--not-fixed">✕ not fixed</span>`
            : "";

        const replies = Array.isArray(c.replies) ? c.replies : [];
        const repliesHtml = replies.length
          ? `<div class="review-replies">
              ${replies.map((r) => {
                const rName = r.isOperator ? "kurizu" : (r.name || "anonymous");
                const rAvatar = r.isOperator
                  ? `<img class="review-reply__avatar review-item__avatar--kurizu" src="assets/sprites/avatar-still.webp" alt="kurizu" width="22" height="22">`
                  : "";
                const rOpBadge = r.isOperator ? `<span class="review-badge--op">★ admin</span>` : "";
                const rDelKey = `rep:${c.id}:${r.id}`;
                const rConfirm = pendingDeletes.has(rDelKey);
                const rDelBtn = isOp
                  ? `<button type="button" class="review-op-btn review-op-btn--del${rConfirm ? " is-confirm" : ""}" data-op-delete-reply="${esc(r.id)}" data-comment-id="${esc(c.id)}">${rConfirm ? "confirm?" : "delete"}</button>`
                  : "";
                return `<div class="review-reply" data-reply-id="${esc(r.id)}">
                  <div class="review-reply__head">
                    ${rAvatar}
                    <strong>${esc(rName)}</strong>
                    ${rOpBadge}
                    <span class="review-reply__time">${esc(formatTimeAgo(r.ts))}</span>
                    ${rDelBtn}
                  </div>
                  <p class="review-reply__text">${esc(r.text || "")}</p>
                </div>`;
              }).join("")}
            </div>`
          : "";

        const cDelKey = `com:${c.id}`;
        const cConfirm = pendingDeletes.has(cDelKey);
        const opControls = isOp
          ? `<div class="review-op-tools">
              <button type="button" class="review-op-btn review-op-btn--fixed${c.tag === "fixed" ? " is-active" : ""}" data-op-tag="fixed" data-comment-id="${esc(c.id)}" aria-pressed="${c.tag === "fixed"}">✓ fixed</button>
              <button type="button" class="review-op-btn review-op-btn--not-fixed${c.tag === "not_fixed" ? " is-active" : ""}" data-op-tag="not_fixed" data-comment-id="${esc(c.id)}" aria-pressed="${c.tag === "not_fixed"}">✕ not fixed</button>
              <button type="button" class="review-op-btn review-op-btn--del${cConfirm ? " is-confirm" : ""}" data-op-delete-comment="${esc(c.id)}">${cConfirm ? "confirm delete?" : "delete"}</button>
            </div>`
          : "";

        const replyNameSlot = isOp
          ? `<div class="review-admin-identity review-admin-identity--compact">
              <img src="assets/sprites/avatar-still.webp" alt="kurizu" width="26" height="26">
              <div><strong>kurizu<span>.exe</span> <span class="review-badge--op">★ admin</span></strong></div>
            </div>`
          : `<input type="text" class="review-reply-form__input" data-reply-name placeholder="your name (optional)" maxlength="24" value="${esc(defaultReplyName)}">`;

        const replyFormHtml = openReplyForId === c.id
          ? `<form class="review-reply-form" data-reply-form="${esc(c.id)}" novalidate>
              ${replyNameSlot}
              <textarea class="review-reply-form__textarea" data-reply-text placeholder="write a reply..." maxlength="300" rows="2"></textarea>
              <div class="review-reply-form__actions">
                <span class="review-reply-form__status" data-reply-status aria-live="polite"></span>
                <button type="button" class="btn btn--small" data-reply-cancel>cancel</button>
                <button type="submit" class="btn btn--small btn--primary">post reply</button>
              </div>
            </form>`
          : "";

        return `<article class="review-item" data-comment-id="${esc(c.id)}">
          <div class="review-item__head">
            ${avatarHtml}
            <strong class="review-item__name">${esc(displayName)}</strong>
            ${opAuthorBadge}
            ${statusBadge}
            ${rStars}
            <span class="review-item__time">${esc(formatTimeAgo(c.ts))}</span>
          </div>
          <p class="review-item__text">${esc(c.text || "")}</p>
          <div class="review-item__foot">
            <button type="button" class="review-reply-btn" data-reply-toggle="${esc(c.id)}">↩ reply${replies.length ? ` (${replies.length})` : ""}</button>
            ${opControls}
          </div>
          ${replyFormHtml}
          ${repliesHtml}
        </article>`;
      }).join("");
    }

    activeReviewRefresh = () => renderData(getCurrentProjectData());

    sortSelect?.addEventListener("change", () => {
      currentSort = sortSelect.value || "newest";
      renderData(getCurrentProjectData());
    });

    async function handleOperatorTag(commentId, clickedTag) {
      if (!isOperatorLoggedIn()) return;
      const cache = loadReviewCache();
      const entry = cache[projectId] || { avg: 0, count: 0, comments: [], deletedIds: [], deletedReplyIds: [] };
      const target = (entry.comments || []).find((c) => c.id === commentId);
      if (!target) return;
      const nextTag = target.tag === clickedTag ? null : clickedTag;
      target.tag = nextTag;
      cache[projectId] = entry;
      saveReviewCache(cache);
      renderData(entry);
      playSfx("pop");

      const sess = loadOpSession();
      if (sess && sess.mode === "server") {
        try {
          const res = await fetch(REVIEWS_API, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "application/json", ...getOpAuthHeaders() },
            body: JSON.stringify({ action: "tag", project: projectId, commentId, tag: nextTag }),
          });
          if (res.status === 401) {
            clearOpSession();
            applyOperatorUiState();
            toast("operator session expired — please log in again");
            return;
          }
          const data = await res.json().catch(() => null);
          if (res.ok && data) {
            const c = loadReviewCache();
            c[projectId] = mergeProjectReviews(c[projectId], data);
            saveReviewCache(c);
            renderData(c[projectId]);
          }
        } catch (_) {}
      }
      toast(nextTag === "fixed" ? "tagged as Fixed ✓" : nextTag === "not_fixed" ? "tagged as Not Fixed ✕" : "status tag cleared");
    }

    async function handleOperatorDelete(commentId, replyId = null) {
      if (!isOperatorLoggedIn()) return;
      const confirmKey = replyId ? `rep:${commentId}:${replyId}` : `com:${commentId}`;
      if (!pendingDeletes.has(confirmKey)) {
        const timer = window.setTimeout(() => {
          pendingDeletes.delete(confirmKey);
          renderData(getCurrentProjectData());
        }, 4000);
        pendingDeletes.set(confirmKey, timer);
        renderData(getCurrentProjectData());
        return;
      }

      window.clearTimeout(pendingDeletes.get(confirmKey));
      pendingDeletes.delete(confirmKey);

      const cache = loadReviewCache();
      const entry = cache[projectId] || { avg: 0, count: 0, comments: [], deletedIds: [], deletedReplyIds: [] };
      if (!Array.isArray(entry.deletedIds)) entry.deletedIds = [];
      if (!Array.isArray(entry.deletedReplyIds)) entry.deletedReplyIds = [];

      if (replyId) {
        const target = (entry.comments || []).find((c) => c.id === commentId);
        if (target && Array.isArray(target.replies)) {
          target.replies = target.replies.filter((r) => r.id !== replyId);
        }
        if (!entry.deletedReplyIds.includes(replyId)) entry.deletedReplyIds.unshift(replyId);
      } else {
        entry.comments = (entry.comments || []).filter((c) => c.id !== commentId);
        entry.commentsCount = entry.comments.length;
        if (!entry.deletedIds.includes(commentId)) entry.deletedIds.unshift(commentId);
      }
      cache[projectId] = entry;
      saveReviewCache(cache);
      renderData(entry);
      playSfx("pop");

      const sess = loadOpSession();
      if (sess && sess.mode === "server") {
        try {
          const res = await fetch(REVIEWS_API, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "application/json", ...getOpAuthHeaders() },
            body: JSON.stringify({ action: "delete", project: projectId, commentId, replyId: replyId || undefined }),
          });
          if (res.status === 401) {
            clearOpSession();
            applyOperatorUiState();
            toast("operator session expired — please log in again");
            return;
          }
          const data = await res.json().catch(() => null);
          if (res.ok && data) {
            const c = loadReviewCache();
            c[projectId] = mergeProjectReviews(c[projectId], data);
            saveReviewCache(c);
            renderData(c[projectId]);
          }
        } catch (_) {}
      }
      toast(replyId ? "reply deleted" : "comment deleted");
    }

    listEl?.addEventListener("click", (event) => {
      const replyToggle = event.target.closest("[data-reply-toggle]");
      if (replyToggle) {
        const cid = replyToggle.dataset.replyToggle;
        openReplyForId = openReplyForId === cid ? null : cid;
        renderData(getCurrentProjectData());
        if (openReplyForId) {
          listEl.querySelector(`[data-reply-form="${CSS.escape(openReplyForId)}"] [data-reply-text]`)?.focus();
        }
        return;
      }

      if (event.target.closest("[data-reply-cancel]")) {
        openReplyForId = null;
        renderData(getCurrentProjectData());
        return;
      }

      const tagBtn = event.target.closest("[data-op-tag]");
      if (tagBtn) {
        handleOperatorTag(tagBtn.dataset.commentId, tagBtn.dataset.opTag);
        return;
      }

      const delCommentBtn = event.target.closest("[data-op-delete-comment]");
      if (delCommentBtn) {
        handleOperatorDelete(delCommentBtn.dataset.opDeleteComment, null);
        return;
      }

      const delReplyBtn = event.target.closest("[data-op-delete-reply]");
      if (delReplyBtn) {
        handleOperatorDelete(delReplyBtn.dataset.commentId, delReplyBtn.dataset.opDeleteReply);
      }
    });

    listEl?.addEventListener("submit", async (event) => {
      const rForm = event.target.closest("[data-reply-form]");
      if (!rForm) return;
      event.preventDefault();

      const cid = rForm.dataset.replyForm;
      const rNameEl = rForm.querySelector("[data-reply-name]");
      const rTextEl = rForm.querySelector("[data-reply-text]");
      const rStatusEl = rForm.querySelector("[data-reply-status]");
      const isOp = isOperatorLoggedIn();
      const rawName = (rNameEl?.value || "").trim().slice(0, 24);
      const name = isOp ? "kurizu" : (rawName || "anonymous");
      const text = (rTextEl?.value || "").trim().slice(0, 300);

      if (!text) {
        if (rStatusEl) rStatusEl.textContent = "type a reply first ♡";
        return;
      }

      try {
        if (rawName && !isOp) localStorage.setItem(REVIEWER_NAME_KEY, rawName);
      } catch (_) {}

      const replyId = "rep_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const nowTs = Date.now();

      const cLocal = loadReviewCache();
      const curLocal = cLocal[projectId] || { avg: 0, count: 0, comments: [], deletedIds: [], deletedReplyIds: [] };
      const target = (curLocal.comments || []).find((c) => c.id === cid);
      if (target) {
        if (!Array.isArray(target.replies)) target.replies = [];
        target.replies.push({ id: replyId, name, text, ts: nowTs, isOperator: isOp });
        cLocal[projectId] = curLocal;
        saveReviewCache(cLocal);
      }
      openReplyForId = null;
      renderData(curLocal);
      playSfx("pop");

      try {
        const res = await fetch(REVIEWS_API, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json", ...getOpAuthHeaders() },
          body: JSON.stringify({
            action: "reply",
            project: projectId,
            commentId: cid,
            replyId,
            name,
            text,
            clientId: getClientId(),
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data) {
          const c = loadReviewCache();
          c[projectId] = mergeProjectReviews(c[projectId], data);
          saveReviewCache(c);
          renderData(c[projectId]);
        }
      } catch (_) {}
      toast("reply posted ♡");
    });

    // 1. Render cached data immediately
    const cache = loadReviewCache();
    if (cache[projectId]) {
      renderData(cache[projectId]);
      if (cache[projectId].myRating) {
        selectedStar = Number(cache[projectId].myRating);
        paintStars(selectedStar);
      }
    }

    // 2. Fetch live data from Render backend & merge with local cache (never overwrite local comments with an empty cold-boot response)
    fetch(`${REVIEWS_API}?project=${encodeURIComponent(projectId)}`, { mode: "cors" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const c = loadReviewCache();
        const localBefore = c[projectId];
        c[projectId] = mergeProjectReviews(localBefore, {
          avg: data.avg,
          count: data.count,
          comments: data.comments || [],
          commentsCount: (data.comments || []).length,
          deletedIds: data.deletedIds || [],
          deletedReplyIds: data.deletedReplyIds || [],
        });
        saveReviewCache(c);
        renderData(c[projectId]);
        resyncMissingReviewsToServer(projectId, localBefore, data);
      })
      .catch(() => {
        if (!cache[projectId] && listEl) {
          listEl.innerHTML = `<p class="case-reviews__empty">no comments yet — drop the first thought below ♡</p>`;
        }
      });

    // 3. Handle new rating / comment submission
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const isOp = isOperatorLoggedIn();
        const rawName = (nameInput?.value || "").trim().slice(0, 24);
        const name = isOp ? "kurizu" : (rawName || "anonymous");
        const text = (textInput?.value || "").trim().slice(0, 400);
        if (!selectedStar && !text) {
          if (statusEl) statusEl.textContent = "pick a star or type a comment first ♡";
          return;
        }
        try {
          if (rawName && !isOp) localStorage.setItem(REVIEWER_NAME_KEY, rawName);
        } catch (_) {}

        if (submitBtn) submitBtn.disabled = true;
        if (statusEl) statusEl.textContent = "posting…";

        const commentId = "rev_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const nowTs = Date.now();

        // Save optimistically to local cache first so comments/ratings never disappear even if the tab closes or server sleeps
        const cLocal = loadReviewCache();
        const curLocal = cLocal[projectId] || { avg: 0, count: 0, comments: [], myRating: 0, deletedIds: [], deletedReplyIds: [] };
        if (text) {
          curLocal.comments = [
            { id: commentId, name, rating: selectedStar, text, ts: nowTs, tag: null, isOperator: isOp, replies: [] },
            ...(curLocal.comments || []),
          ];
        }
        if (selectedStar) {
          const prevMyRating = Number(curLocal.myRating || 0);
          if (prevMyRating > 0 && curLocal.count > 0) {
            const total = Math.max(0, curLocal.avg * curLocal.count - prevMyRating) + selectedStar;
            curLocal.avg = +(total / curLocal.count).toFixed(1);
          } else {
            const total = curLocal.avg * curLocal.count + selectedStar;
            curLocal.count += 1;
            curLocal.avg = +(total / curLocal.count).toFixed(1);
          }
          curLocal.myRating = selectedStar;
        }
        curLocal.commentsCount = (curLocal.comments || []).length;
        cLocal[projectId] = curLocal;
        saveReviewCache(cLocal);
        renderData(curLocal);

        try {
          const res = await fetch(REVIEWS_API, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "application/json", ...getOpAuthHeaders() },
            body: JSON.stringify({
              id: commentId,
              project: projectId,
              name,
              rating: selectedStar,
              text,
              clientId: getClientId(),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not post");
          const c = loadReviewCache();
          c[projectId] = mergeProjectReviews(c[projectId], {
            avg: data.avg,
            count: data.count,
            comments: data.comments || [],
            commentsCount: (data.comments || []).length,
            deletedIds: data.deletedIds || [],
            deletedReplyIds: data.deletedReplyIds || [],
            myRating: selectedStar || c[projectId]?.myRating || 0,
          });
          saveReviewCache(c);
          renderData(c[projectId]);
          if (textInput) textInput.value = "";
          if (charEl) charEl.textContent = "0 / 400";
          if (statusEl) statusEl.textContent = "posted! thank you ♡";
          toast("review posted! thank you ♡");
        } catch (err) {
          if (textInput) textInput.value = "";
          if (charEl) charEl.textContent = "0 / 400";
          if (statusEl) statusEl.textContent = "saved! thank you ♡";
          toast("review saved ♡");
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }
  }

  syncAllReviewSummaries();

  /* deep link: #project-aipet */
  const hashMatch = /^#project-(.+)$/.exec(window.location.hash);
  if (hashMatch) {
    const project = projectById(decodeURIComponent(hashMatch[1]));
    if (project) window.setTimeout(() => openProject(project.id, { hash: false }), 180);
  }

})();
