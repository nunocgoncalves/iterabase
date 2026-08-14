(() => {
  "use strict";

  const FORM_ENDPOINT = "https://formspree.io/f/xeajzaoe";
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

  let submitting = false;

  function track(name, props = {}) {
    if (typeof window.plausible === "function") {
      window.plausible(name, { props });
    }
  }

  function saveCapturedEmail(email) {
    if (window.IterabaseBooking) {
      window.IterabaseBooking.setEmail(email);
      return;
    }
    try {
      window.sessionStorage.setItem("iterabase_demo_email", email);
    } catch (_error) {
      // Session storage is an optional convenience for Cal.com prefilling.
    }
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
    if (window.IterabaseBooking) window.IterabaseBooking.init();

    document.querySelectorAll("[data-cal-link]").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (!window.IterabaseBooking) return;
        window.IterabaseBooking.open({
          event,
          location: link.dataset.calLocation || "unknown",
          bookingUrl: link.href,
        });
      });
    });

    const form = document.getElementById("demo-form");
    form.addEventListener("submit", submitLead);
    document.getElementById("demo-email").addEventListener("input", () => setGateError(false));

    const demoLink = document.querySelector("[data-demo-link]");
    const demoUrl = new URL(demoLink.href, window.location.href);
    for (const [key, value] of Object.entries(attribution)) demoUrl.searchParams.set(key, value);
    demoLink.href = demoUrl.href;
    demoLink.addEventListener("click", () => {
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
