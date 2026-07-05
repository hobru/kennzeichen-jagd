/* Einzige Stelle, an der die Versionsnummer gepflegt wird.
   Bei jedem Release hochzählen – App-Anzeige und Offline-Cache
   (Service Worker) ziehen automatisch nach. */
(typeof self !== "undefined" ? self : window).APP_VERSION = "1.3.0";
