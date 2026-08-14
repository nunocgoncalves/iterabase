(() => {
  "use strict";

  const DEFAULT_BOOKING_URL = "https://cal.com/nunocgoncalves/30min";
  const EMAIL_KEY = "iterabase_demo_email";
  const EMAIL_HANDOFF_KEY = "iterabase_demo_email_handoff";
  const ATTRIBUTION_KEY = "iterabase_attribution";
  const ATTRIBUTION_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
  ];

  let initialized = false;
  let calEmbedReady = false;
  let lastLocation = "unknown";
  let bookingTracked = false;

  function readJson(storage, key) {
    try {
      return JSON.parse(storage.getItem(key) || "null");
    } catch (_error) {
      return null;
    }
  }

  function currentAttribution() {
    const saved = readJson(window.sessionStorage, ATTRIBUTION_KEY) || {};
    const search = new URLSearchParams(window.location.search);
    const current = Object.fromEntries(
      ATTRIBUTION_KEYS.filter((key) => search.has(key)).map((key) => [key, search.get(key)])
    );
    const attribution = { ...saved, ...current };
    if (Object.keys(attribution).length) {
      try {
        window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
      } catch (_error) {
        // Attribution storage is an optional convenience between same-origin pages.
      }
    }
    return attribution;
  }

  function setEmail(email) {
    const value = String(email || "").trim();
    if (!value) return;
    try {
      window.sessionStorage.setItem(EMAIL_KEY, value);
    } catch (_error) {
      // Session storage is an optional convenience for Cal.com prefilling.
    }
    try {
      window.localStorage.setItem(
        EMAIL_HANDOFF_KEY,
        JSON.stringify({ email: value, expiresAt: Date.now() + 2 * 60 * 60 * 1000 })
      );
    } catch (_error) {
      // The short-lived handoff lets a no-opener demo tab prefill the booking form.
    }
  }

  function readEmail() {
    try {
      const sessionEmail = window.sessionStorage.getItem(EMAIL_KEY);
      if (sessionEmail) {
        if (window.location.pathname.startsWith("/demo")) {
          window.localStorage.removeItem(EMAIL_HANDOFF_KEY);
        }
        return sessionEmail;
      }
    } catch (_error) {
      // Fall through to the cross-tab handoff.
    }

    try {
      const handoff = readJson(window.localStorage, EMAIL_HANDOFF_KEY);
      if (!handoff || handoff.expiresAt <= Date.now()) {
        window.localStorage.removeItem(EMAIL_HANDOFF_KEY);
        return "";
      }
      if (handoff.email) {
        window.sessionStorage.setItem(EMAIL_KEY, handoff.email);
        window.localStorage.removeItem(EMAIL_HANDOFF_KEY);
        return handoff.email;
      }
    } catch (_error) {
      // Prefilling is optional when storage is unavailable.
    }
    return "";
  }

  function track(name, props) {
    if (typeof window.plausible === "function") {
      window.plausible(name, { props });
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    currentAttribution();
    try {
      const handoff = readJson(window.localStorage, EMAIL_HANDOFF_KEY);
      if (handoff && handoff.expiresAt <= Date.now()) {
        window.localStorage.removeItem(EMAIL_HANDOFF_KEY);
      }
    } catch (_error) {
      // Storage cleanup is optional.
    }

    if (!window.Cal) {
      (function (C, A, L) {
        const push = function (api, args) {
          api.q.push(args);
        };
        const document = C.document;
        C.Cal = C.Cal || function () {
          const cal = C.Cal;
          const args = arguments;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            const script = document.createElement("script");
            script.src = A;
            script.async = true;
            script.addEventListener("load", () => {
              calEmbedReady = true;
            });
            document.head.appendChild(script);
            cal.loaded = true;
          }
          if (args[0] === L) {
            const api = function () {
              push(api, arguments);
            };
            const namespace = args[1];
            api.q = api.q || [];
            if (typeof namespace === "string") {
              cal.ns[namespace] = cal.ns[namespace] || api;
              push(cal.ns[namespace], args);
              push(cal, ["initNamespace", namespace]);
            } else {
              push(cal, args);
            }
            return;
          }
          push(cal, args);
        };
      })(window, "https://app.cal.com/embed/embed.js", "init");
    } else if (window.Cal.loaded) {
      calEmbedReady = true;
    }

    window.Cal("init", { origin: "https://app.cal.com" });
    window.Cal("ui", {
      theme: "dark",
      hideEventTypeDetails: false,
      cssVarsPerTheme: {
        light: { "cal-brand": "#1666E0" },
        dark: { "cal-brand": "#2D82F7" },
      },
    });
    window.Cal("on", {
      action: "bookingSuccessfulV2",
      callback: () => {
        if (bookingTracked) return;
        bookingTracked = true;
        track("Call Booked", { location: lastLocation });
      },
    });
  }

  function calLinkFromUrl(bookingUrl) {
    return bookingUrl
      .replace(/^https?:\/\/(app\.)?cal\.com\//, "")
      .replace(/[?#].*$/, "")
      .replace(/^\/+|\/+$/g, "");
  }

  function bookingConfig() {
    const config = {
      theme: "dark",
      layout: "month_view",
      ...currentAttribution(),
    };
    const email = readEmail();
    if (email) config.email = email;
    return config;
  }

  function fallbackUrl(bookingUrl, config) {
    const url = new URL(bookingUrl, window.location.href);
    for (const [key, value] of Object.entries(config)) {
      if (key !== "theme" && key !== "layout" && value) url.searchParams.set(key, value);
    }
    return url.href;
  }

  function open({ event, location = "unknown", bookingUrl = DEFAULT_BOOKING_URL } = {}) {
    init();
    lastLocation = location;
    bookingTracked = false;
    track("Booking Started", { location });

    const config = bookingConfig();
    const fallback = fallbackUrl(bookingUrl, config);
    if (!calEmbedReady || typeof window.Cal !== "function") {
      const anchor = event && event.currentTarget && event.currentTarget.tagName === "A"
        ? event.currentTarget
        : null;
      if (anchor) {
        anchor.href = fallback;
      } else {
        window.open(fallback, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (event) event.preventDefault();
    try {
      window.Cal("modal", {
        calLink: calLinkFromUrl(bookingUrl),
        config,
      });
    } catch (_error) {
      window.open(fallback, "_blank", "noopener,noreferrer");
    }
  }

  window.IterabaseBooking = {
    init,
    open,
    setEmail,
    getAttribution: currentAttribution,
  };
})();
