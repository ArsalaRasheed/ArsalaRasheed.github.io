/* ==========================================================================
   AL-KHAN PAINTS — SITE CONFIGURATION
   --------------------------------------------------------------------------
   This is the SINGLE SOURCE OF TRUTH for the landing page.

   Everything that may need to change before or after launch lives here:
   WhatsApp number, business details, analytics hook and pre-filled messages.

   No secrets are stored in this file. Nothing here is a credential.
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. WHATSAPP NUMBER
   --------------------------------------------------------------------------
   Format: country code + number, digits ONLY.
   No "+", no spaces, no dashes, no parentheses.

   Example (Pakistan, Rawalpindi landline/mobile):
       const WHATSAPP_NUMBER = "923001234567";

   The value below is the business's real number, supplied by the owner.
   Every WhatsApp CTA on the page is built from this one variable, so a single
   edit here updates all of them. If it is still a placeholder when the page
   loads, a warning is logged to the browser console.
   -------------------------------------------------------------------------- */
const WHATSAPP_NUMBER = "923498272533";

/* --------------------------------------------------------------------------
   2. BUSINESS IDENTITY
   -------------------------------------------------------------------------- */
const SITE_CONFIG = {
  brandName: "AL-KHAN PAINTS",
  brandShort: "AL-KHAN",
  positioning: "Complete Refinish Solutions",

  description:
    "Paint retailer and wholesaler supplying 2K refinishing, decorative, deco and enamel paints, and related paint supplies from multiple established brands.",

  address: {
    line1: "65/3 Asghar Mall Scheme",
    line2: "National Market",
    city: "Rawalpindi",
    country: "Pakistan"
  },

  /**
   * Verified Google Maps listing, supplied by the business owner.
   * Tracking parameters were stripped; the place and coordinates are unchanged.
   * The map link only renders when this is set.
   */
  mapsUrl:
    "https://www.google.com/maps/place/AL-Khan+Paints/@33.6324375,73.0681875,17z/data=!4m6!3m5!1s0x38df95ab3b544c3d:0x22a21f84b7f6bc8c!8m2!3d33.6324375!4d73.0681875!16s%2Fg%2F11rg2h1jyn",

  /**
   * Coordinates from that listing — used only for schema.org geo data and the
   * "Open in Maps" fallback, never as fabricated map coordinates.
   */
  geo: {
    latitude: 33.6324375,
    longitude: 73.0681875
  },

  /**
   * Canonical production URL. Emitted as <link rel="canonical">, and also used
   * for og:url and the JSON-LD `url`, so all three always agree.
   *
   * The custom domain GitHub Pages serves from. Changing this means changing
   * four places in lockstep — the tag here, og:url / og:image / twitter:image
   * in index.html, sitemap.xml, and the Sitemap line in robots.txt.
   */
  canonicalUrl: "https://info.alkhanpaints.com/"
};

/* --------------------------------------------------------------------------
   3. PRE-FILLED WHATSAPP MESSAGES
   --------------------------------------------------------------------------
   Keys map to the `data-wa` attribute on any element in index.html.
   Add a new key here and reference it with data-wa="your-key" — no other
   file needs to change.

   Tone: professional, direct, written for a Pakistani B2B buyer who is
   enquiring about wholesale / bulk supply.
   -------------------------------------------------------------------------- */
const WHATSAPP_MESSAGES = {
  "generic":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I would like to know more about your paint products and supply services.",

  "bulk-order":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in placing a bulk paint order. Please share available brands, product options, wholesale pricing, and quantity details.",

  "bulk-quote":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I would like to request a bulk-order quotation. I can share the brands, paint categories and quantities I need.",

  "color-match":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I need help with color matching for my project. I would like to discuss the shade I am looking for and the available matching options.",

  "final-chat":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am ready to source paint in bulk. Please help me with brands, paint categories, quantities and a wholesale quotation.",

  "contact":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I have a question about your store and paint supply services.",

  /* Category-level enquiries — one per paint category card. */
  "cat-decorative":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in DECORATIVE PAINTS. Please share available brands, product options and wholesale pricing.",
  "cat-deco":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in DECO PAINTS. Please share available brands, product options and wholesale pricing.",
  "cat-enamel":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in ENAMEL PAINTS. Please share available brands, product options and wholesale pricing.",
  "cat-2k":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in 2K PAINTS. Please share available brands, product options and wholesale pricing.",
  "cat-hardeners":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in HARDENERS. Please share available brands, product options and wholesale pricing.",
  "cat-clear":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in CLEAR COATS & LACQUERS. Please share available brands, product options and wholesale pricing.",
  "cat-primers":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in PRIMERS. Please share available brands, product options and wholesale pricing.",
  "cat-thinners":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in THINNERS. Please share available brands, product options and wholesale pricing.",
  "cat-spray-guns":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in SPRAY GUNS and related equipment. Please share available options and wholesale pricing.",
  "cat-paint-pens":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in PAINT PENS / touch-up pens. Please share available options and wholesale pricing.",
  "cat-supplies":
    "Assalam-o-Alaikum AL-KHAN PAINTS. I am interested in PAINT & REFINISHING SUPPLIES. Please share the available range and wholesale pricing."
};

/* --------------------------------------------------------------------------
   4. WHATSAPP LINK BUILDER
   --------------------------------------------------------------------------
   Builds: https://wa.me/<number>?text=<encoded message>

   • wa.me works on mobile (app / web), desktop and WhatsApp Web.
   • target="_blank" + rel="noopener" opens a new tab on desktop without
     navigating the visitor away from the landing page mid-conversion.
   -------------------------------------------------------------------------- */
function buildWhatsAppUrl(messageKey) {
  const message = WHATSAPP_MESSAGES[messageKey] || WHATSAPP_MESSAGES["generic"];
  return (
    "https://wa.me/" +
    WHATSAPP_NUMBER +
    "?text=" +
    encodeURIComponent(message)
  );
}

/* --------------------------------------------------------------------------
   5. ANALYTICS HOOK  (optional, disabled by default)
   --------------------------------------------------------------------------
   No third-party tracking script is bundled with this page — loading one
   without proper configuration and user consent would be inappropriate.

   Instead, every CTA click pushes a lightweight event onto the standard
   `window.dataLayer` queue (Google Tag Manager's convention). If GTM or any
   other consumer is later configured, these events can be picked up with no
   code change.

   To wire up a different provider, replace the body of `track()`.
   -------------------------------------------------------------------------- */
function track(eventName, eventData) {
  try {
    if (typeof window === "undefined") return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(
      Object.assign(
        {
          event: eventName,
          eventCategory: "engagement",
          eventLabel: "al-khan-paints-landing"
        },
        eventData || {}
      )
    );
  } catch (e) {
    /* Analytics must never break the page. Fail silently. */
  }
}

/* --------------------------------------------------------------------------
   6. DEVELOPMENT SAFETY CHECK
   -------------------------------------------------------------------------- */
(function warnIfUnconfigured() {
  try {
    if (/[^0-9]/.test(WHATSAPP_NUMBER)) {
      console.warn(
        "\n[AL-KHAN PAINTS] ⚠️ WhatsApp number is still a PLACEHOLDER.\n" +
          "    Current value: " +
          WHATSAPP_NUMBER +
          "\n" +
          "    Set a real number in js/config.js (WHATSAPP_NUMBER) before launch.\n"
      );
    }
  } catch (e) {
    /* no-op */
  }
})();