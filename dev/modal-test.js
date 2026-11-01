(() => {
  const d = window.__viditDebug;
  d.modal.open({
    kicker: "Test",
    title: "Manual modal test",
    body: '<p class="modal-copy">Hello</p>',
    actions: '<button class="btn-primary" type="button" data-action="close">Close</button>'
  });
  d.modal.onAction = (action) => {
    if (action === "close") d.modal.close();
  };
  return {
    open: d.modal.isOpen,
    hidden: document.querySelector("#modalRoot").hidden,
    display: getComputedStyle(document.querySelector("#modalRoot")).display,
    title: document.querySelector("#modalTitle").textContent
  };
})();
