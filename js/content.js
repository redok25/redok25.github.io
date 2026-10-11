// ===================================
// CONTENT.JS - Portfolio Content
// ===================================
import { JOR } from "./helpers.js";

// World stations open the matching Quick View section (D496).
const STATION_SECTIONS = {
  "about-modal": "about",
  "skills-modal": "skills",
  "projects-modal": "projects",
  "contact-modal": "contact",
};

export function openModal(modalId) {
  const section = STATION_SECTIONS[modalId];
  if (section && window.QV) window.QV.open(section);
}

// Custom styled alert (replaces native alert)
export function showCustomAlert(message, options = {}) {
  const { type = "info", duration = 4000 } = options;

  // Create container if missing
  let container = document.getElementById("custom-alert-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "custom-alert-container";
    document.body.appendChild(container);
  }

  const alertEl = document.createElement("div");
  alertEl.className = `custom-alert custom-alert--${type}`;
  alertEl.setAttribute("role", "alert");
  alertEl.innerHTML =
    '<div class="custom-alert__body"></div>' +
    '<button class="custom-alert__close" aria-label="Close alert">&times;</button>';
  alertEl.querySelector(".custom-alert__body").textContent = message;

  const closeBtn = alertEl.querySelector(".custom-alert__close");
  const removeAlert = () => {
    alertEl.classList.remove("custom-alert--show");
    alertEl.addEventListener(
      "transitionend",
      () => {
        if (alertEl.parentNode) alertEl.parentNode.removeChild(alertEl);
      },
      { once: true }
    );
  };

  closeBtn.addEventListener("click", removeAlert);

  container.appendChild(alertEl);

  // allow CSS transition to animate in
  requestAnimationFrame(() => {
    alertEl.classList.add("custom-alert--show");
  });

  if (duration > 0) {
    setTimeout(removeAlert, duration);
  }
}

const WHATSAPP_NUMBER = "6285156264959"; // Format: CountryCode + Number

// Contact form handler: hands the message to WhatsApp, fully URL-encoded.
export function handleContactSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const url = JOR.buildWhatsAppUrl(WHATSAPP_NUMBER, {
    name: form.get("name"),
    email: form.get("email"),
    message: form.get("message"),
  });
  window.open(url, "_blank", "noopener");
  // Close Quick View first: the toast lives below the dialog's top layer.
  if (window.QV) window.QV.close();
  showCustomAlert("Mengarahkan ke WhatsApp...", { type: "success", duration: 3000 });
}
