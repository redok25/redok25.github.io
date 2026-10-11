// ===================================
// ACTIONS.JS - Delegated [data-action] handlers (they replace inline on*= attributes).
// A form fires its action on submit; any other element fires on click.
// ===================================
const handlers = {};

export function onAction(name, handler) {
  handlers[name] = handler;
}

for (const type of ["click", "submit"]) {
  document.addEventListener(type, (event) => {
    const el = event.target.closest && event.target.closest("[data-action]");
    if (!el || (el.tagName === "FORM") !== (type === "submit")) return;
    const handler = handlers[el.dataset.action];
    if (handler) handler(event, el);
  });
}
