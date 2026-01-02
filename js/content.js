// ===================================
// CONTENT.JS - Portfolio Content
// ===================================

// Modal control functions
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("hidden");
    // Resume game
    if (window.game) {
      window.game.paused = false;
    }
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("hidden");
    // Pause game
    if (window.game) {
      window.game.paused = true;
    }
  }
}

// Custom styled alert (replaces native alert)
function showCustomAlert(message, options = {}) {
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
  alertEl.innerHTML = `
    <div class="custom-alert__body">${message}</div>
    <button class="custom-alert__close" aria-label="Close alert">&times;</button>
  `;

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

// Contact form handler
function handleContactSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const name = formData.get("name");
  const email = formData.get("email");
  const message = formData.get("message");

  // Format message for WhatsApp
  const phoneNumber = "6285156264959"; // Format: CountryCode + Number
  const text = `Halo, saya ${name} (${email}).%0A%0A${message}`;
  
  // Open WhatsApp in new tab
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${text}`;
  window.open(whatsappUrl, '_blank');

  showCustomAlert(
    "Mengarahkan ke WhatsApp...",
    { type: "success", duration: 3000 }
  );
  
  event.target.reset();
  closeModal("contact-modal");
}
