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
  const data = {
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  };

  // Here you would normally send to a backend
  console.log("Contact form submitted:", data);
  showCustomAlert(
    "Terima kasih! Pesan Anda telah dikirim. (Demo mode - tidak benar-benar terkirim)",
    { type: "success", duration: 4500 }
  );
  event.target.reset();
  closeModal("contact-modal");
}

// Close modals with ESC key
// Close modals with ESC key - DISABLED per user request
// document.addEventListener("keydown", (e) => {
//   if (e.key === "Escape") {
//     const modals = document.querySelectorAll(".modal:not(.hidden)");
//     modals.forEach((modal) => {
//       modal.classList.add("hidden");
//       if (window.game) {
//         window.game.paused = false;
//       }
//     });
//   }
// });
