/* ==========================================================================
   AL-KHAN PAINTS — Landing Page Interactions
   --------------------------------------------------------------------------
   Progressive enhancement only. Every element works (or degrades gracefully)
   without this file:

     • All navigation links are real anchors, so sections are reachable
       without JavaScript.
     • WhatsApp CTAs are wired from js/config.js and carry a documented
       placeholder until a real number is supplied.
     • Motion is additive and fully disabled under prefers-reduced-motion.

   Contents
     1. Helpers
     2. WhatsApp CTAs
     3. Optional configuration (maps link, canonical URL)
     4. Mobile navigation
     5. Sticky header state
     6. Active section highlighting
     7. Reveal-on-scroll animations
     8. Floating / sticky conversion UI
     9. Footer year
   ========================================================================== */

(function () {
  "use strict";

  /* ============================================================ 1. HELPERS */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  /* ==================================================== 2. WHATSAPP CTAs */
  /* Every [data-wa] element on the page is pointed at wa.me using the single
     WHATSAPP_NUMBER in config.js. Adding a CTA needs no change here — just
     add data-wa="<message-key>" to any link. */
  function initWhatsAppLinks() {
    $$("[data-wa]").forEach(function (el) {
      var key = el.getAttribute("data-wa");
      var url = buildWhatsAppUrl(key);

      el.setAttribute("href", url);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");

      // Analytics hook — fires only if a consumer reads window.dataLayer.
      el.addEventListener("click", function () {
        track("whatsapp_click", {
          waMessage: key,
          waSection: el.closest("section, header, footer")?.id || "unknown"
        });
      });
    });
  }

  /* ==================================================== 3. BRAND LOGOS */
  /* Official brand logo files live in assets/img/brands/. If a file is
     missing the <img> never loads and the typographic wordmark stays visible,
     so the section always looks finished either way. */
  function initBrandLogos() {
    $$(".brand-tile__logo").forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add("is-ok");
        return;
      }
      img.addEventListener("load", function () {
        if (img.naturalWidth > 0) img.classList.add("is-ok");
      });
      img.addEventListener("error", function () { img.classList.remove("is-ok"); });
    });
  }

  /* ============================================ 3. STORE PHOTO FALLBACK */
  /* The store photo is optional. Until assets/img/store-front.jpg exists the
     frame shows a branded placeholder instead of a broken image icon.

     The image is lazy-loaded, so it may not have attempted to load when the
     DOM is ready — hence the error listener AND a viewport check. */
  function initStorePhoto() {
    $$(".store__frame").forEach(function (frame) {
      var img = frame.querySelector(".store__photo");
      if (!img) return;

      function check() {
        if (img.complete && img.naturalWidth === 0) frame.classList.add("is-missing");
      }
      function onError() { frame.classList.add("is-missing"); }

      check();
      img.addEventListener("error", onError);
      img.addEventListener("load", function () { frame.classList.remove("is-missing"); });

      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { check(); io.disconnect(); }
          });
        }, { rootMargin: "200px" });
        io.observe(frame);
      }
    });
  }

  /* ============================================ 4. OPTIONAL CONFIGURATION */
  /* Renders optional elements only when a real value exists, so nothing
     dead or invented ever ships. */
  function initOptionalConfig() {
    // Google Maps — link button + the tappable address card.
    if (SITE_CONFIG.mapsUrl) {
      ["#mapsLink", "#mapCard"].forEach(function (sel) {
        var el = $(sel);
        if (el) { el.href = SITE_CONFIG.mapsUrl; el.hidden = false; }
      });
    }

    // Canonical URL — emitted only once the production domain is known.
    if (SITE_CONFIG.canonicalUrl) {
      var link = document.createElement("link");
      link.rel = "canonical";
      link.href = SITE_CONFIG.canonicalUrl;
      document.head.appendChild(link);
    }

    // Structured data — business facts only. No invented phone, hours,
    // ratings or review counts. geo/hasMap come from the owner's verified
    // Google Maps listing configured above.
    var ld = {
      "@context": "https://schema.org",
      "@type": "Store",
      name: SITE_CONFIG.brandName,
      description: SITE_CONFIG.description,
      slogan: SITE_CONFIG.positioning,
      address: {
        "@type": "PostalAddress",
        streetAddress: SITE_CONFIG.address.line1 + ", " + SITE_CONFIG.address.line2,
        addressLocality: SITE_CONFIG.address.city,
        addressCountry: "PK"
      }
    };
    if (SITE_CONFIG.geo) {
      ld.geo = {
        "@type": "GeoCoordinates",
        latitude: SITE_CONFIG.geo.latitude,
        longitude: SITE_CONFIG.geo.longitude
      };
    }
    if (SITE_CONFIG.mapsUrl) ld.hasMap = SITE_CONFIG.mapsUrl;

    // Site URL and share image — added only once the domain is live. A
    // fabricated URL is worse for structured data than an absent one, so both
    // come straight from the canonicalUrl set in config.js.
    if (SITE_CONFIG.canonicalUrl) {
      var base = SITE_CONFIG.canonicalUrl.replace(/\/+$/, "");
      ld.url = base + "/";
      ld.image = base + "/assets/img/og-image.jpg";
    }

    var ldEl = document.createElement("script");
    ldEl.type = "application/ld+json";
    ldEl.textContent = JSON.stringify(ld);
    document.head.appendChild(ldEl);
  }

  /* =================================================== 4. MOBILE NAVIGATION */
  function initMobileNav() {
    var toggle = $("#navToggle");
    var nav = $("#siteNav");
    var scrim = $("#navScrim");
    if (!toggle || !nav || !scrim) return;

    var isOpen = false;
    var lastFocused = null;

    function open() {
      lastFocused = document.activeElement;
      isOpen = true;
      nav.classList.add("is-open");
      scrim.hidden = false;
      // Force a reflow so the scrim transition runs.
      void scrim.offsetWidth;
      scrim.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close menu");
      document.body.classList.add("nav-open");
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      nav.classList.remove("is-open");
      scrim.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
      document.body.classList.remove("nav-open");
      window.setTimeout(function () { if (!isOpen) scrim.hidden = true; }, 280);
      if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    }

    toggle.addEventListener("click", function () {
      if (isOpen) { close(); } else { open(); }
    });

    scrim.addEventListener("click", close);

    // Close after choosing a destination.
    $$("a", nav).forEach(function (link) {
      link.addEventListener("click", close);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) { close(); return; }

      // Keep tab focus inside the open panel.
      if (e.key === "Tab" && isOpen) {
        var focusables = $$("a[href], button:not([disabled])", nav)
          .filter(function (el) { return el.offsetParent !== null; });
        if (!focusables.length) return;

        var first = focusables[0];
        var last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // If the viewport grows past the mobile breakpoint, reset state.
    var mq = window.matchMedia("(min-width: 901px)");
    var onChange = function (e) { if (e.matches) close(); };
    if (mq.addEventListener) { mq.addEventListener("change", onChange); }
    else if (mq.addListener) { mq.addListener(onChange); }
  }

  /* =================================================== 5. STICKY HEADER */
  function initStickyHeader() {
    var header = $("#siteHeader");
    if (!header) return;

    var ticking = false;
    function update() {
      header.classList.toggle("site-header--solid", window.scrollY > 12);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ========================================== 6. ACTIVE SECTION HIGHLIGHT */
  function initScrollSpy() {
    var links = $$(".site-nav__list a");
    if (!links.length || !("IntersectionObserver" in window)) return;

    var map = {};
    var targets = [];
    links.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var section = document.getElementById(id);
      if (section) { map[id] = link; targets.push(section); }
    });

    var visible = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { visible.add(entry.target.id); }
        else { visible.delete(entry.target.id); }
      });

      // Highlight the topmost visible section for a stable indicator.
      var activeId = targets
        .map(function (s) { return s.id; })
        .filter(function (id) { return visible.has(id); })
        .sort(function (a, b) {
          return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        })[0];

      links.forEach(function (l) { l.classList.remove("is-active"); });
      if (activeId && map[activeId]) map[activeId].classList.add("is-active");
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

    targets.forEach(function (s) { io.observe(s); });
  }

  /* ================================================= 7. REVEAL ANIMATIONS */
  function initReveal() {
    /* Deliberately EXCLUDED: the hero and the final CTA block.
       Any element above the fold — and any block whose purpose is conversion —
       must render immediately and must never depend on JavaScript, an
       IntersectionObserver callback or a transition finishing. If a visitor
       arrives on a slow connection, the primary WhatsApp button still has to be
       there. Reveal motion is reserved for below-the-fold supporting content. */
    var items = $$(".section-head, .cat-card, .brand-tile, .reason-card, .step, .bulk__copy > *, .bulk__panel, .segment-list li, .contact__copy > *, .contact__card, .match__visual");

    /* Hard safety rule: never hide an element that contains a link or button.
       Animation is decorative and must never withhold a conversion path. */
    items = items.filter(function (el) {
      return !el.querySelector("a[href], button");
    });

    if (!items.length) return;

    // Stagger grid items for a natural cascade.
    items.forEach(function (el, i) {
      el.setAttribute("data-reveal", "");
      el.style.transitionDelay = reduceMotion.matches ? "0ms" : Math.min(i % 6, 5) * 60 + "ms";
    });

    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-revealed"); });
      return;
    }

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        obs.unobserve(entry.target); // one-shot, keeps scrolling cheap
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ===================================== 8. FLOATING / STICKY CONVERSION UI */
  function initConversionUi() {
    var hero = $(".hero");
    var floatBtn = $("#waFloat");
    var sticky = $("#stickyCta");
    var finalCta = $("#finalCta");
    var footer = $(".site-footer");

    if (!hero || (!floatBtn && !sticky)) return;

    // reveal once the visitor has moved past the hero
    var pastHero = false;
    // hide once the final CTA or footer is on screen (they contain their own CTA)
    var suppress = false;

    function apply() {
      // Desktop: floating button. Mobile: sticky bottom bar.
      if (floatBtn) floatBtn.hidden = !pastHero || suppress;

      if (sticky) {
        var show = pastHero && !suppress;
        sticky.hidden = false;
        sticky.classList.toggle("is-visible", show);
        document.body.classList.toggle("has-sticky-cta", show);
      }
    }

    function update() {
      var anchor = window.scrollY + window.innerHeight * 0.45;
      var heroBottom = hero.offsetTop + hero.offsetHeight;
      pastHero = anchor > heroBottom;
      apply();
    }

    var ticking = false;
    window.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(function () { update(); ticking = false; }); ticking = true; }
    }, { passive: true });

    // Suppress the floating UI when a section with its own CTA is visible.
    if ("IntersectionObserver" in window && (finalCta || footer)) {
      var io = new IntersectionObserver(function (entries) {
        suppress = entries.some(function (e) { return e.isIntersecting; });
        apply();
      }, { threshold: 0.15 });
      [finalCta, footer].forEach(function (el) { if (el) io.observe(el); });
    }

    update();
  }

  /* ======================================================= 9. FOOTER YEAR */
  function initYear() {
    var el = $("#year");
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ============================================================== 10. BOOT */
  function init() {
    try { initWhatsAppLinks(); } catch (e) {}
    try { initBrandLogos(); } catch (e) {}
    try { initStorePhoto(); } catch (e) {}
    try { initOptionalConfig(); } catch (e) {}
    try { initMobileNav(); } catch (e) {}
    try { initStickyHeader(); } catch (e) {}
    try { initScrollSpy(); } catch (e) {}
    try { initReveal(); } catch (e) { /* content stays visible */ }
    try { initConversionUi(); } catch (e) {}
    try { initYear(); } catch (e) {}
    track("page_view", { pagePath: window.location.pathname });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();