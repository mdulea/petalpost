// Browser-only: puts rendered invites into the page and fits their text. Pages load it after templates.js.

// The only way invites enter the page: html from renderInvite, then the fit step for that root.
function mountInvites(root, html) {
  root.innerHTML = html;
  fitInvites(root);
}

// Cards whose text overflows get the compact layout: one-line note and tighter spacing.
function fitInvites(root = document) {
  root.querySelectorAll('.invite').forEach((card) => {
    card.classList.remove('is-tight');
    if (card.clientHeight && card.scrollHeight > card.clientHeight + 1) card.classList.add('is-tight');
  });
}

if (document.fonts) document.fonts.ready.then(() => fitInvites());
