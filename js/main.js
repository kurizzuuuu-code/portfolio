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
          <span class="project-card__badge">${project.featured ? "★ featured" : esc(project.year)}</span>
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

  function openDialog(dialog) {
    if (!dialog || typeof dialog.showModal !== "function") return false;
    if (!dialog.open) {
      dialog.showModal();
      lockScroll();
    }
    return true;
  }

  [projectDialog, lightbox].forEach((dialog) => {
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
    const links = (project.links || []).map((link) =>
      `<a class="btn btn--small" href="${esc(link.url)}" target="_blank" rel="noopener">${icon(link.icon || "external")}${esc(link.label)}</a>`
    ).join("");
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
        ${compareMarkup}
        ${videos.length ? `<div class="case__section">
          <h3>${icon("play")} ${videos.length > 1 ? "watch the videos" : "watch the showcase"}</h3>
          <div class="case__videos">${videoMarkup}</div>
        </div>` : ""}
        ${highlights ? `<div class="case__section">
          <h3>${icon("sparkle")} what makes it tick</h3>
          <ul class="case__list">${highlights}</ul>
        </div>` : ""}
        ${gallery ? `<div class="case__section">
          <h3>${icon("folder")} screens & sprites</h3>
          <div class="case__gallery">${gallery}</div>
        </div>` : ""}
        <div class="case__section">
          <h3>${icon("puzzle")} built with</h3>
          <ul class="case__tags">${tags}</ul>
        </div>
        <div class="case__section">
          <h3>${icon("external")} find it</h3>
          ${links ? `<div class="case__links">${links}</div>` : `<p class="case__note">${progress ? "still baking — ask me for a build ♡" : "source lives on my laptop (or in a folder named final_final_v3). ask me about it ♡"}</p>`}
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
              <input type="text" id="caseReviewName" class="case-reviews__input" placeholder="your name (optional)" maxlength="24" autocomplete="nickname">
              <textarea id="caseReviewText" class="case-reviews__textarea" placeholder="leave a comment or feedback on ${esc(project.title)}..." maxlength="400" rows="3"></textarea>
            </div>
            <div class="case-reviews__actions">
              <span class="case-reviews__char" id="caseReviewChar">0 / 400</span>
              <span class="case-reviews__status" id="caseReviewStatus" aria-live="polite"></span>
              <button type="submit" class="btn btn--small btn--primary" id="caseReviewSubmit">post review ★</button>
            </div>
          </form>
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

    if (!openDialog(projectDialog)) return;

    const scroll = $(".modal__scroll", projectDialog);
    if (scroll) scroll.scrollTop = 0;

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

  player.volume = 0.7;
  try {
    const stored = JSON.parse(window.localStorage.getItem("kurizu.player") || "{}");
    if (typeof stored.volume === "number") player.volume = Math.min(1, Math.max(0, stored.volume));
    if (typeof stored.shuffle === "boolean") shuffleOn = stored.shuffle;
    if (stored.repeat === "all" || stored.repeat === "one") repeatMode = stored.repeat;
  } catch (error) { /* private mode — defaults are fine */ }

  function savePlayer() {
    try {
      window.localStorage.setItem("kurizu.player", JSON.stringify({
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

  function loadTrack(index, autoplay = true) {
    if (!musicTracks.length) return;
    trackIndex = ((index % musicTracks.length) + musicTracks.length) % musicTracks.length;
    player.src = musicTracks[trackIndex].src;
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

  player.addEventListener("play", () => { soundOn = true; updatePlayerUI(); });
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
    const rawVal = event.target.value ?? volumeSlider?.value ?? 70;
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
    updatePlayerUI();
    if (!musicTracks.length) return;
    player.src = musicTracks[0].src;
    play(); // auto-start; falls back to the first click/keypress if the browser says no
  }

  /* ============================================================
     ARCADE — Do Not Stop: Forest Run, embedded and self-contained
     ============================================================ */
  const gameDialog = $("#gameDialog");
  const gameIframe = $("#gameIframe");
  const gameLoading = $("[data-game-loading]");
  let gameFrameReady = false;
  let gameMusicWasOn = false;

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
    }
    openDialog(gameDialog);
    window.setTimeout(() => {
      try { gameIframe.focus(); } catch (error) { /* noop */ }
    }, 300);
  }

  function stopGame() {
    if (!gameIframe) return;
    gameFrameReady = false;
    gameIframe.src = "about:blank";
    setGameLoading(true);
    refreshArcadeBest();
  }

  if (gameIframe) {
    gameIframe.addEventListener("load", () => {
      if (!gameFrameReady) return;
      setGameLoading(false);
      try { gameIframe.focus(); } catch (error) { /* noop */ }
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
    if (event.target.closest("[data-play-game]")) openGame();
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
    if (data.state === "gameover" || data.state === "menu") refreshArcadeBest();
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
     DESKTOP APP SHORTCUT ICONS & OS WINDOW MANAGER (MINIMIZE / MAXIMIZE / CLOSE)
     ============================================================ */
  const APP_EXTENSIONS = {
    aipet: { file: "AIPet.exe", ext: ".EXE", color: "#a855f7" },
    pixify: { file: "pixify.app", ext: ".WEB", color: "#ec4899" },
    wobble: { file: "wobble.app", ext: ".WEB", color: "#f59e0b" },
    malfoy: { file: "malfoy.exe", ext: ".EXE", color: "#ef4444" },
    "forest-run": { file: "forest_run.exe", ext: ".GAME", color: "#10b981" },
    "ai-blocker": { file: "ai_blocker.crx", ext: ".CRX", color: "#3b82f6" },
    "dns-changer": { file: "dns_ph.apk", ext: ".APK", color: "#06b6d4" },
    lanshare: { file: "lanshare.exe", ext: ".EXE", color: "#8b5cf6" },
    firesword: { file: "firesword.mc", ext: ".MOD", color: "#f97316" },
  };

  function getDesktopShortcutItems() {
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
      };
    });
    // Add 3D Avatar Viewer & Terminal system shortcuts
    projectApps.push(
      {
        id: "kurizu3d",
        kind: "scroll-win",
        targetWin: "kurizu3d",
        targetSelector: "#kurizu3d",
        title: "Kurizu 3D Rig",
        subtitle: "Interactive WebGL Avatar",
        file: "kurizu_3d.exe",
        ext: ".3D",
        color: "#d946ef",
        image: "assets/sprites/mascot-still.webp",
      },
      {
        id: "terminal-app",
        kind: "terminal",
        targetWin: "about",
        targetSelector: "#interactiveTerminal",
        title: "Terminal",
        subtitle: "Interactive Shell",
        file: "terminal.sh",
        ext: ".CMD",
        color: "#22c55e",
        image: "assets/sprites/idle-still.webp",
      },
      {
        id: "gallery-app",
        kind: "scroll-win",
        targetWin: "gallery",
        targetSelector: ".gallery-window",
        title: "Art Gallery",
        subtitle: "57 Hand-drawn Pieces",
        file: "gallery.exe",
        ext: ".ART",
        color: "#f43f5e",
        image: "assets/arts/digital/wisteria-night.webp",
      }
    );
    return projectApps;
  }

  function launchDesktopApp(item) {
    playSfx("powerup");
    if (item.kind === "project" || item.kind === "game-or-case") {
      openProject(item.id);
      toast(`launching ${item.file}… ✨`);
    } else if (item.kind === "terminal") {
      restoreWindowById("about");
      $("#interactiveTerminal")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      window.setTimeout(() => $("#terminalInput")?.focus(), 420);
      toast("opened terminal.sh — type help!");
    } else if (item.kind === "scroll-win") {
      if (item.targetWin) restoreWindowById(item.targetWin);
      const el = $(item.targetSelector);
      if (el) el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      toast(`opened ${item.file} ✨`);
    }
  }

  const desktopIconOffsets = new Map();

  function initDesktopAppIcons() {
    const grids = [$("#desktopAppsGrid"), $("#browserAppsGrid")].filter(Boolean);
    if (!grids.length) return;
    const items = getDesktopShortcutItems();
    const statusEl = $("#desktopSelectionStatus");

    const markup = items.map((item) => `
      <button type="button" class="desktop-icon" role="listitem" data-app-id="${esc(item.id)}" title="${esc(item.title)} — ${esc(item.subtitle)} (Double-click or tap to open)">
        <span class="desktop-icon__frame">
          <img src="${esc(item.image)}" alt="${esc(item.title)}" width="56" height="56" loading="lazy" draggable="false">
          <span class="desktop-icon__ext" style="--ext-bg:${esc(item.color)}">${esc(item.ext)}</span>
          <span class="desktop-icon__shortcut" aria-hidden="true">↗</span>
        </span>
        <span class="desktop-icon__label">${esc(item.file)}</span>
      </button>
    `).join("");

    grids.forEach((grid) => {
      grid.innerHTML = markup;
    });

    let selectedId = null;
    let lastClickId = null;
    let lastClickTime = 0;

    grids.forEach((grid) => {
      // Selection + single-tap/double-click launch
      grid.addEventListener("click", (e) => {
        const btn = e.target.closest(".desktop-icon[data-app-id]");
        if (!btn || btn.dataset.justDragged === "1") return;
        const appId = btn.dataset.appId;
        const item = items.find((x) => x.id === appId);
        if (!item) return;

        const now = Date.now();
        const isTouch = window.matchMedia("(pointer: coarse)").matches;
        const isDouble = (lastClickId === appId && now - lastClickTime < 550) || isTouch;

        $$(".desktop-icon").forEach((ic) => ic.classList.toggle("is-selected", ic.dataset.appId === appId));
        selectedId = appId;
        lastClickId = appId;
        lastClickTime = now;

        if (statusEl) {
          statusEl.textContent = `${item.file} — ${item.subtitle} · click again to launch`;
        }

        if (isDouble) {
          launchDesktopApp(item);
          lastClickId = null;
        } else {
          playSfx("click");
        }
      });

      // Drag icons around inside the desktop grid
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

    // Deselect when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".desktop-icon")) {
        $$(".desktop-icon.is-selected").forEach((ic) => ic.classList.remove("is-selected"));
        selectedId = null;
      }
    });
  }

  // Track managed desktop windows for minimize / maximize / close
  const managedWindows = new Map();

  function updateTaskbarTray() {
    const tray = $("#taskbarTray");
    if (!tray) return;
    const pills = [];
    managedWindows.forEach((info, id) => {
      const isMin = info.el.classList.contains("is-minimized");
      const isClosed = info.el.classList.contains("is-closed");
      if (isMin || isClosed) {
        pills.push(`
          <button type="button" class="taskbar__tray-btn ${isClosed ? "is-closed-pill" : "is-min-pill"}" data-restore-win="${esc(id)}" title="Click to restore ${esc(info.title)}">
            <span class="taskbar__tray-dot"></span>
            <span>${esc(info.title)}</span>
          </button>
        `);
      }
    });
    tray.innerHTML = pills.join("");
  }

  function restoreWindowById(id, scroll = false) {
    const info = managedWindows.get(id);
    if (!info) return;
    const wasHidden = info.el.classList.contains("is-minimized") || info.el.classList.contains("is-closed");
    info.el.classList.remove("is-minimized", "is-closed");
    updateTaskbarTray();
    if (wasHidden) playSfx("pop");
    if (scroll) {
      info.el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }
  }

  function restoreAllDesktopWindows() {
    managedWindows.forEach((info) => {
      info.el.classList.remove("is-minimized", "is-closed", "is-maximized");
    });
    document.body.classList.remove("has-maximized-window");
    desktopIconOffsets.forEach((_, iconEl) => {
      iconEl.style.transform = "";
    });
    desktopIconOffsets.clear();
    updateTaskbarTray();
    resetAllDraggableWindows();
  }

  function initDesktopWindowManager() {
    const windowSpecs = [
      { id: "browser", sel: "#heroBrowser", title: "kurizu.exe", barSel: "#browserTabs" },
      { id: "launchpad", sel: "#desktopLaunchpad", title: "my_apps.dir" },
      { id: "profile", sel: ".profile-card", title: "official_account" },
      { id: "about", sel: ".about-window", title: "about_me.txt" },
      { id: "work", sel: ".explorer", title: "projects.exe" },
      { id: "arcade", sel: ".arcade-window", title: "forest_run.exe" },
      { id: "reel", sel: "#reel", title: "showreel.mp4" },
      { id: "kurizu3d", sel: "#kurizu3d", title: "kurizu_avatar_3d.exe" },
      { id: "gallery", sel: ".gallery-window", title: "art_gallery.exe" },
      { id: "contact", sel: ".contact-window", title: "new_message.exe" },
    ];

    windowSpecs.forEach((spec) => {
      const win = $(spec.sel);
      if (!win) return;
      const bar = spec.barSel ? $(spec.barSel, win) : $(".window__bar", win);
      if (!bar) return;

      win.dataset.winId = spec.id;
      managedWindows.set(spec.id, { id: spec.id, el: win, bar, title: spec.title });

      // Make the 3 retro traffic dots interactive (dot 1 = close, dot 2 = minimize, dot 3 = maximize)
      const dots = $(".win-dots", bar);
      if (dots) {
        dots.removeAttribute("aria-hidden");
        const dotItems = $$("i", dots);
        if (dotItems[0]) { dotItems[0].title = "Close window"; dotItems[0].dataset.winAct = "close"; }
        if (dotItems[1]) { dotItems[1].title = "Minimize window"; dotItems[1].dataset.winAct = "minimize"; }
        if (dotItems[2]) { dotItems[2].title = "Maximize / restore"; dotItems[2].dataset.winAct = "maximize"; }
      }

      // Inject crisp OS window control buttons [ — ] [ □ ] [ × ] on the right side of the titlebar
      if (!$(".win-controls", bar)) {
        const ctrls = document.createElement("div");
        ctrls.className = "win-controls";
        ctrls.innerHTML = `
          <button type="button" class="win-ctrl win-ctrl--min" data-win-act="minimize" aria-label="Minimize ${esc(spec.title)}" title="Minimize">—</button>
          <button type="button" class="win-ctrl win-ctrl--max" data-win-act="maximize" aria-label="Maximize or restore ${esc(spec.title)}" title="Maximize / Restore">□</button>
          <button type="button" class="win-ctrl win-ctrl--close" data-win-act="close" aria-label="Close ${esc(spec.title)}" title="Close to taskbar">×</button>
        `;
        bar.appendChild(ctrls);
      }

      bar.addEventListener("click", (e) => {
        const actEl = e.target.closest("[data-win-act]");
        if (!actEl) {
          // Clicking anywhere on a minimized titlebar un-minimizes it!
          if (win.classList.contains("is-minimized") && !e.target.closest("button, a, input")) {
            win.classList.remove("is-minimized");
            playSfx("pop");
            updateTaskbarTray();
          }
          return;
        }
        e.stopPropagation();
        const act = actEl.dataset.winAct;

        if (act === "minimize") {
          win.classList.remove("is-maximized");
          document.body.classList.toggle("has-maximized-window", !!$(".window.is-maximized"));
          const min = win.classList.toggle("is-minimized");
          playSfx("pop");
          updateTaskbarTray();
          toast(min ? `minimized ${spec.title} (click bar or taskbar to restore)` : `restored ${spec.title} ✨`);
        } else if (act === "maximize") {
          win.classList.remove("is-minimized");
          const max = win.classList.toggle("is-maximized");
          document.body.classList.toggle("has-maximized-window", !!$(".window.is-maximized"));
          playSfx("pop");
          updateTaskbarTray();
          if (spec.id === "kurizu3d") window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
        } else if (act === "close") {
          win.classList.remove("is-maximized", "is-minimized");
          document.body.classList.toggle("has-maximized-window", !!$(".window.is-maximized"));
          win.classList.add("is-closed");
          playSfx("pop");
          updateTaskbarTray();
          toast(`closed ${spec.title} — click its taskbar pill or icon to reopen ✨`);
        }
      });
    });

    // Restore from taskbar tray pills
    $("#taskbarTray")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-restore-win]");
      if (!btn) return;
      const id = btn.dataset.restoreWin;
      restoreWindowById(id, true);
      toast(`restored ${managedWindows.get(id)?.title || "window"} ✨`);
    });

    // Restore all button in Desktop Launchpad & Start Menu soft reset
    $("#desktopRestoreAllBtn")?.addEventListener("click", () => {
      restoreAllDesktopWindows();
    });

    // Clicking nav links (#about, #work, #arcade, #media, #contact, #home) automatically restores any closed/minimized windows in that section!
    document.addEventListener("click", (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const hash = link.getAttribute("href");
      const map = {
        "#home": ["browser", "launchpad", "profile"],
        "#about": ["about"],
        "#work": ["work"],
        "#arcade": ["arcade"],
        "#media": ["reel", "kurizu3d", "gallery"],
        "#contact": ["contact"],
      };
      if (map[hash]) {
        map[hash].forEach((id) => restoreWindowById(id, false));
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
  let petRAF = 0;
  let petDir = 1;
  let petX = 0;
  let petY = 0;
  let petHappiness = 85;

  try {
    const savedHappy = parseInt(window.localStorage.getItem("kurizu.petHappy"), 10);
    if (!Number.isNaN(savedHappy)) petHappiness = Math.min(100, Math.max(20, savedHappy));
  } catch (_) {}

  function updatePetHappyUI(delta = 0) {
    petHappiness = Math.min(100, Math.max(10, petHappiness + delta));
    try { window.localStorage.setItem("kurizu.petHappy", String(petHappiness)); } catch (_) {}
    const fill = $("#petHappyFill");
    const val = $("#petHappyVal");
    if (fill) fill.style.width = `${petHappiness}%`;
    if (val) val.textContent = `${petHappiness}%`;
  }
  updatePetHappyUI(0);

  function feedPet() {
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
    if (petAnimWrap) petAnimWrap.classList.remove("is-bouncing");
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

  function petSay(text) {
    if (!petBubble) return;
    petBubble.textContent = text;
    petBubble.classList.add("is-visible");
    window.clearTimeout(petBubbleTimer);
    petBubbleTimer = window.setTimeout(() => petBubble.classList.remove("is-visible"), 2800);
  }

  function petPlay(mood) {
    const src = petPick(petAnims(mood));
    const url = petSrc(src);
    if (!petImg || !url) return false;
    petImg.src = url;
    return true;
  }

  function petToIdle() {
    petStopWalk();
    if (petAnimWrap) petAnimWrap.classList.remove("is-bouncing");
    if (petImg) petImg.classList.remove("is-bouncing");
    if (petStage) petStage.classList.remove("is-bouncing");
    petMoodCurrent = "idle";
    petBusy = false;
    window.clearTimeout(petIdleTimer);
    petIdleTimer = window.setTimeout(() => {
      if (petMoodCurrent !== "idle") return;
      if (petBusy || petChatOpen || document.hidden) return;
      goIdle();
    }, 6500 + Math.random() * 9500);
  }

  function goIdle() {
    petToIdle();
    if (petPlay("idle")) {
      petBusy = true;
      window.setTimeout(() => { petBusy = false; }, 2400);
    }
  }

  function goWalk(dir) {
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
    if (!finePointer || petBusy || petChatOpen) return;
    petStopWalk();
    petMoodCurrent = "headpat";
    petPlay("headpat");
    petBusy = true;
    petSay(petPick(petBubblesFor("pat")) || "pat pat ♡ best pats in the whole wide web");
    window.clearTimeout(petActionTimer);
    petActionTimer = window.setTimeout(() => { petBusy = false; petToIdle(); }, 900);
  }

  function poke() {
    if (petChatOpen) return;
    petStopWalk();
    petMoodCurrent = "poke";
    petPlay("poke");
    triggerPetBounce();
    petBusy = true;
    petSay(petPick(petBubblesFor("poke")) || "stop poking me!!");
    window.clearTimeout(petActionTimer);
    petActionTimer = window.setTimeout(() => { petBusy = false; petToIdle(); }, 1300);
  }

  function petChatty() {
    if (petBusy || petChatOpen || document.hidden) {
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
      if (finePointer && !petBusy && !petDragging) {
        updatePetHappyUI(2);
        headPat();
      }
    });

    petStage.addEventListener("pointerdown", (event) => {
      if (event.target.closest("#petFeedBtn")) return;
      event.preventDefault();
      cancelAnimationFrame(gravityRAF);
      petDragging = true;
      petMoved = false;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      basePetX = petX;
      basePetY = petY;
      petStage.style.transition = "none";
      try { petStage.setPointerCapture(event.pointerId); } catch (_) {}
    });

    petStage.addEventListener("pointermove", (event) => {
      if (!petDragging) return;
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
        const minX = -(window.innerWidth - 180);
        petX = Math.max(minX, Math.min(20, basePetX + dx));
        petY = Math.min(0, Math.max(-(window.innerHeight - 240), basePetY + dy));
        applyPetTransform();
      }
    });

    const endPetPointer = (event) => {
      if (!petDragging) return;
      petDragging = false;
      try { petStage.releasePointerCapture(event.pointerId); } catch (_) {}
      if (petMoved) {
        petBusy = false;
        dropPetWithGravity();
      } else {
        petStage.style.transition = "";
        poke();
      }
    };

    petStage.addEventListener("pointerup", endPetPointer);
    petStage.addEventListener("pointercancel", endPetPointer);
    petStage.addEventListener("click", (event) => {
      if (!event.target.closest("#petFeedBtn")) event.preventDefault();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (petChatOpen) chatClose();
  });

  function initPet() {
    goIdle();
    petChatty();
  }

  if (petRoot) initPet();

  /* ============================================================
     PROJECT STAR RATINGS & COMMENTS (live Render backend + local cache)
     ============================================================ */
  const REVIEWS_API = "https://kurizu-game-server.onrender.com/api/reviews";
  const REVIEWS_CACHE_KEY = "kurizu_reviews_cache_v1";
  const REVIEWER_NAME_KEY = "kurizu_reviewer_name";
  const REVIEWER_CID_KEY = "kurizu_client_id";

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

  function syncAllReviewSummaries() {
    const cache = loadReviewCache();
    Object.keys(cache).forEach((pid) => updateCardRatingBadge(pid, cache[pid]));

    fetch(REVIEWS_API, { mode: "cors" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.projects) return;
        const nextCache = loadReviewCache();
        Object.entries(data.projects).forEach(([pid, sum]) => {
          nextCache[pid] = Object.assign({}, nextCache[pid] || {}, sum);
          updateCardRatingBadge(pid, nextCache[pid]);
        });
        saveReviewCache(nextCache);
      })
      .catch(() => { /* offline or server waking up — local cache is already shown */ });
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

    const STAR_LABELS = ["click a star", "1 / 5 · needs work", "2 / 5 · okay", "3 / 5 · pretty cool", "4 / 5 · love it!", "5 / 5 · masterpiece ★"];
    let selectedStar = 0;

    try {
      const savedName = localStorage.getItem(REVIEWER_NAME_KEY);
      if (savedName && nameInput) nameInput.value = savedName;
    } catch (_) {}

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

    function renderData(data) {
      const count = Number(data?.count || 0);
      const avg = Number(data?.avg || 0);
      const comments = Array.isArray(data?.comments) ? data.comments : [];

      if (avgEl) avgEl.textContent = count > 0 ? avg.toFixed(1) : "—";
      if (starsDisp) starsDisp.textContent = formatStarsStr(avg);
      if (countEl) {
        countEl.textContent = count > 0
          ? `${count} rating${count === 1 ? "" : "s"} · ${comments.length} comment${comments.length === 1 ? "" : "s"}`
          : (comments.length ? `${comments.length} comment${comments.length === 1 ? "" : "s"} · be the first to rate ♡` : "be the first to rate or comment ♡");
      }

      updateCardRatingBadge(projectId, { avg, count, commentsCount: comments.length });

      if (!listEl) return;
      if (!comments.length) {
        listEl.innerHTML = `<p class="case-reviews__empty">no comments yet — drop the first thought below ♡</p>`;
        return;
      }

      listEl.innerHTML = comments.map((c) => {
        const initial = (String(c.name || "A").trim()[0] || "A").toUpperCase();
        const rStars = c.rating >= 1 && c.rating <= 5
          ? `<span class="review-item__stars" aria-label="Rated ${c.rating} out of 5">${formatStarsStr(c.rating)}</span>`
          : "";
        return `<article class="review-item">
          <div class="review-item__head">
            <span class="review-item__avatar" aria-hidden="true">${esc(initial)}</span>
            <strong class="review-item__name">${esc(c.name || "anonymous")}</strong>
            ${rStars}
            <span class="review-item__time">${esc(formatTimeAgo(c.ts))}</span>
          </div>
          <p class="review-item__text">${esc(c.text || "")}</p>
        </article>`;
      }).join("");
    }

    // 1. Render cached data immediately
    const cache = loadReviewCache();
    if (cache[projectId]) renderData(cache[projectId]);

    // 2. Fetch live data from Render backend
    fetch(`${REVIEWS_API}?project=${encodeURIComponent(projectId)}`, { mode: "cors" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const c = loadReviewCache();
        c[projectId] = { avg: data.avg, count: data.count, comments: data.comments || [], commentsCount: (data.comments || []).length };
        saveReviewCache(c);
        renderData(c[projectId]);
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
        const name = (nameInput?.value || "").trim().slice(0, 24) || "anonymous";
        const text = (textInput?.value || "").trim().slice(0, 400);
        if (!selectedStar && !text) {
          if (statusEl) statusEl.textContent = "pick a star or type a comment first ♡";
          return;
        }
        try {
          if (nameInput?.value.trim()) localStorage.setItem(REVIEWER_NAME_KEY, name);
        } catch (_) {}

        if (submitBtn) submitBtn.disabled = true;
        if (statusEl) statusEl.textContent = "posting…";

        try {
          const res = await fetch(REVIEWS_API, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
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
          c[projectId] = { avg: data.avg, count: data.count, comments: data.comments || [], commentsCount: (data.comments || []).length };
          saveReviewCache(c);
          renderData(c[projectId]);
          if (textInput) textInput.value = "";
          if (charEl) charEl.textContent = "0 / 400";
          if (statusEl) statusEl.textContent = "posted! thank you ♡";
          toast("review posted! thank you ♡");
        } catch (err) {
          // Graceful local fallback if Render is sleeping/offline
          const c = loadReviewCache();
          const cur = c[projectId] || { avg: 0, count: 0, comments: [] };
          if (text) {
            cur.comments = [{ id: "local_" + Date.now(), name, rating: selectedStar, text, ts: Date.now() }, ...(cur.comments || [])];
          }
          if (selectedStar) {
            const total = cur.avg * cur.count + selectedStar;
            cur.count += 1;
            cur.avg = +(total / cur.count).toFixed(1);
          }
          cur.commentsCount = (cur.comments || []).length;
          c[projectId] = cur;
          saveReviewCache(c);
          renderData(cur);
          if (textInput) textInput.value = "";
          if (charEl) charEl.textContent = "0 / 400";
          if (statusEl) statusEl.textContent = "saved locally (server waking up)";
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
