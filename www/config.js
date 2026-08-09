/* config.js
 * Two backend servers are available:
 *   server1 = https://server.hamaridunia.in   (DEFAULT)
 *   server2 = https://enic.hamaridunia.in      (MANUAL - switch from top header)
 *
 * Active server choice is saved in localStorage so Order + Invoice
 * pages (same origin, loaded as iframes from index.html) both use
 * the SAME server automatically - no need to set it twice.
 */

window.APP_SERVERS = {
  server1: {
    key: "server1",
    label: "server.hamaridunia.in",
    url: "https://server.hamaridunia.in"
  },
  server2: {
    key: "server2",
    label: "enic.hamaridunia.in",
    url: "https://enic.hamaridunia.in"
  }
};

function getActiveServerKey() {
  const saved = localStorage.getItem("activeServerKey");
  return window.APP_SERVERS[saved] ? saved : "server1";
}

function setActiveServerKey(key) {
  if (!window.APP_SERVERS[key]) return;
  localStorage.setItem("activeServerKey", key);
}

function getActiveServer() {
  return window.APP_SERVERS[getActiveServerKey()];
}

window.APP_CONFIG = {
  get BASE_URL() {
    return getActiveServer().url;
  }
};