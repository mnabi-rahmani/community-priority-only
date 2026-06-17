(function () {
  const AUTH_STORAGE_KEY = "communityPrioritiesAuth";
  const AUTH_SESSION_MS = 24 * 60 * 60 * 1000;

  function decodeJwtPayload(token) {
    try {
      const part = token.split(".")[1];
      if (!part) return null;
      const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function getTokenExpiresAt(token) {
    const payload = decodeJwtPayload(token);
    return payload?.exp ? payload.exp * 1000 : null;
  }

  function readStoredAuth() {
    try {
      return JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function isStoredAuthFresh(stored) {
    if (!stored?.token) return false;
    const expiresAt = stored.expiresAt || getTokenExpiresAt(stored.token);
    if (!expiresAt) return true;
    return Date.now() < expiresAt;
  }

  function storeAuth(authState) {
    const expiresAt = getTokenExpiresAt(authState.token) || Date.now() + AUTH_SESSION_MS;
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ ...authState, expiresAt })
    );
  }

  function clearStoredAuth() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function setAuthKnownClass(known) {
    document.documentElement.classList.toggle("cp-auth-known", Boolean(known));
  }

  function initAuth(config) {
    const AUTH_API_BASE_URL = (config.authApiBaseUrl || "https://tfqmwiadc8.execute-api.us-east-1.amazonaws.com").replace(/\/$/, "");
    const AUTH_ALLOWED_MODULES = new Set(config.allowedAuthModules || ["clusters_map", "all"]);
    const unauthorizedMessage = config.unauthorizedMessage || "This user is not authorized for the Community Priorities map.";

    const authScreen = document.getElementById("authScreen");
    const authForm = document.getElementById("authForm");
    const authUserId = document.getElementById("authUserId");
    const authPassword = document.getElementById("authPassword");
    const authSubmit = document.getElementById("authSubmit");
    const authMessage = document.getElementById("authMessage");
    const authUserPanel = document.getElementById("authUserPanel");
    const authUserLabel = document.getElementById("authUserLabel");
    const authLogout = document.getElementById("authLogout");

    function isAllowedUser(user) {
      return Boolean(user && AUTH_ALLOWED_MODULES.has(user.module));
    }

    function showAuthMessage(message) {
      if (!authMessage) return;
      authMessage.textContent = message;
      authMessage.hidden = false;
    }

    function clearAuthMessage() {
      if (!authMessage) return;
      authMessage.textContent = "";
      authMessage.hidden = true;
    }

    function showLogin() {
      setAuthKnownClass(false);
      if (authScreen) authScreen.hidden = false;
      if (authUserPanel) authUserPanel.hidden = true;
      authUserId?.focus();
    }

    function showAuthenticatedApp(user) {
      setAuthKnownClass(true);
      if (authScreen) authScreen.hidden = true;
      if (authUserPanel) authUserPanel.hidden = false;
      if (authUserLabel) {
        const moduleLabel = user.module === "all" ? "All Modules" : "Clusters Map";
        authUserLabel.textContent = `${user.name || user.userId} (${user.role} - ${moduleLabel})`;
      }
    }

    async function authRequest(path, options = {}) {
      const response = await fetch(`${AUTH_API_BASE_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || "Authentication request failed.");
      }
      return payload.data || payload;
    }

    async function verifyStoredAuth() {
      const stored = readStoredAuth();
      if (!isStoredAuthFresh(stored)) {
        clearStoredAuth();
        showLogin();
        return;
      }

      if (stored.user && isAllowedUser(stored.user)) {
        showAuthenticatedApp(stored.user);
      }

      try {
        const data = await authRequest("/auth/verify", {
          method: "GET",
          headers: { Authorization: `Bearer ${stored.token}` }
        });
        const user = data.user || stored.user;
        if (!data.valid || !isAllowedUser(user)) {
          clearStoredAuth();
          showLogin();
          return;
        }
        storeAuth({ token: stored.token, user, expiresIn: stored.expiresIn });
        showAuthenticatedApp(user);
      } catch {
        if (!isStoredAuthFresh(stored) || !stored.user || !isAllowedUser(stored.user)) {
          clearStoredAuth();
          showLogin();
        }
      }
    }

    authForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAuthMessage();
      const userId = authUserId?.value.trim();
      const password = authPassword?.value || "";
      if (!userId || !password) {
        showAuthMessage("Enter both username and password.");
        return;
      }
      if (authSubmit) {
        authSubmit.disabled = true;
        authSubmit.textContent = "Signing in...";
      }
      try {
        const data = await authRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({ userId, password })
        });
        if (!isAllowedUser(data.user)) {
          clearStoredAuth();
          showAuthMessage(unauthorizedMessage);
          return;
        }
        storeAuth({ token: data.token, user: data.user, expiresIn: data.expiresIn });
        if (authPassword) authPassword.value = "";
        showAuthenticatedApp(data.user);
      } catch (error) {
        clearStoredAuth();
        showAuthMessage(error.message || "Invalid username or password.");
      } finally {
        if (authSubmit) {
          authSubmit.disabled = false;
          authSubmit.textContent = "Sign in";
        }
      }
    });

    authLogout?.addEventListener("click", () => {
      clearStoredAuth();
      showLogin();
    });

    verifyStoredAuth();
  }

  window.CommunityPrioritiesAuth = {
    AUTH_STORAGE_KEY,
    readStoredAuth,
    isStoredAuthFresh,
    init: initAuth
  };
})();
