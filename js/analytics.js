window.va =
  window.va ||
  function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
// Private links keep their secrets after the #, so no page address reaches analytics with that part.
window.va('beforeSend', function (event) {
  return Object.assign({}, event, { url: event.url.split('#')[0] });
});
