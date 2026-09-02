(() => {
  const route = document.currentScript?.dataset?.tlRoute;
  if (!route || !/^[a-zA-Z0-9_-]+\.html$/.test(route)) return;

  const currentUrl = new URL(window.location.href);
  const appUrl = new URL("app.html", currentUrl);
  appUrl.search = currentUrl.search;
  appUrl.searchParams.set("tl-route", route);
  appUrl.hash = currentUrl.hash;
  window.location.replace(appUrl.toString());
})();
