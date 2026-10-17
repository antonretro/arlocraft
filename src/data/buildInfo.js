/* global __APP_VERSION__, __BUILD_SHA__, __BUILD_DATE__ */
// Injected by vite.config.js at build time.
export const APP_VERSION = __APP_VERSION__;
export const BUILD_SHA = __BUILD_SHA__;
export const BUILD_DATE = __BUILD_DATE__;
export const VERSION_LABEL = `v${APP_VERSION}`;
export const BUILD_LABEL = `Build ${BUILD_DATE} · ${BUILD_SHA}`;
