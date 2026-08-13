(() => {
  "use strict";

  const FORM_ENDPOINT = "https://formspree.io/f/xeajzaoe";
  const CAL_LINK = "nunocgoncalves/30min";
  const ATTRIBUTION_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
  ];

  const environment =
    window.iterabaseEnvironment ||
    (/^(www\.)?iterabase\.com$/.test(window.location.hostname) ? "production" : "preview");
  const search = new URLSearchParams(window.location.search);
  const attribution = Object.fromEntries(
    ATTRIBUTION_KEYS.filter((key) => search.has(key)).map((key) => [key, search.get(key)])
  );

  let capturedEmail = readCapturedEmail();
  let calEmbedReady = false;
  let lastCalLocation = "unknown";
  let bookingTracked = false;
  let submitting = false;

  function track(name, props = {}) {
    if (typeof window.plausible === "function") {
      window.plausible(name, { props });
    }
  }

  function readCapturedEmail() {
    try {
      return window.sessionStorage.getItem("iterabase_demo_email") || "";
    } catch (_error) {
      return "";
    }
  }

  function saveCapturedEmail(email) {
    capturedEmail = email;
    try {
      window.sessionStorage.setItem("iterabase_demo_email", email);
    } catch (_error) {
      // Session storage is an optional convenience for Cal.com prefilling.
    }
  }

  function initCal() {
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
        track("Call Booked", { location: lastCalLocation });
      },
    });
  }

  function openCal(event) {
    const link = event.currentTarget;
    lastCalLocation = link.dataset.calLocation || "unknown";
    bookingTracked = false;
    track("Booking Started", { location: lastCalLocation });

    // Preserve the supplied external URL as a working fallback if Cal's embed
    // script is unavailable or the visitor clicks before it has loaded.
    if (!calEmbedReady || typeof window.Cal !== "function") return;

    event.preventDefault();
    const config = {
      theme: "dark",
      layout: "month_view",
      ...attribution,
    };
    if (capturedEmail) config.email = capturedEmail;

    window.Cal("modal", {
      calLink: CAL_LINK,
      config,
    });
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
  }

  function setGateSuccess() {
    document.getElementById("gate-form-state").hidden = true;
    document.getElementById("gate-success-state").hidden = false;
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function setGateError(show) {
    const input = document.getElementById("demo-email");
    const error = document.getElementById("demo-error");
    error.hidden = !show;
    if (show) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
    } else {
      input.removeAttribute("aria-invalid");
    }
  }

  function leadPayload(email) {
    const data = new FormData();
    data.set("email", email);
    data.set("_subject", "Iterabase platform demo lead");
    data.set("source", "landing_demo_gate");
    data.set("environment", environment);
    data.set("page_url", window.location.href);
    data.set("referrer", document.referrer || "direct");
    for (const [key, value] of Object.entries(attribution)) {
      data.set(key, value);
    }
    return data;
  }

  async function submitLead(event) {
    event.preventDefault();
    if (submitting) return;

    const input = document.getElementById("demo-email");
    const email = input.value.trim();
    if (!isValidEmail(email)) {
      setGateError(true);
      return;
    }

    setGateError(false);
    submitting = true;
    saveCapturedEmail(email);

    let captured = false;
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      const response = await window.fetch(FORM_ENDPOINT, {
        method: "POST",
        body: leadPayload(email),
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      captured = response.ok;
    } catch (_error) {
      captured = false;
    }

    if (captured) {
      track("Lead Captured", { source: "platform_demo" });
    } else {
      track("Lead Capture Failed", { source: "platform_demo" });
    }

    // This is intentionally a soft gate: a lead-provider outage must not block
    // a prospect from seeing the sample-data demo.
    setGateSuccess();
    submitting = false;
  }

  function init() {
    initCal();

    document.querySelectorAll("[data-cal-link]").forEach((link) => {
      link.addEventListener("click", openCal);
    });

    const form = document.getElementById("demo-form");
    form.addEventListener("submit", submitLead);
    document.getElementById("demo-email").addEventListener("input", () => setGateError(false));

    document.querySelector("[data-demo-link]").addEventListener("click", () => {
      track("Demo Opened", { source: "platform_gate" });
    });
    document.querySelector("[data-email-contact]").addEventListener("click", () => {
      track("Email Contact Clicked", { location: "final" });
    });

    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
