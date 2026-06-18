(function () {
  var AUTH_STORAGE_KEY = "communityPrioritiesAuth";

  function decodeJwtExpiresAt(token) {
    try {
      var part = token.split(".")[1];
      if (!part) return null;
      var payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      return payload.exp ? payload.exp * 1000 : null;
    } catch (error) {
      return null;
    }
  }

  function isStoredAuthFresh(stored) {
    if (!stored || !stored.token) return false;
    var expiresAt = stored.expiresAt || decodeJwtExpiresAt(stored.token);
    if (!expiresAt) return true;
    return Date.now() < expiresAt;
  }

  try {
    var stored = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    if (isStoredAuthFresh(stored)) {
      document.documentElement.classList.add("cp-auth-known");
    }
  } catch (error) {
    // Ignore malformed storage during bootstrap.
  }
})();
