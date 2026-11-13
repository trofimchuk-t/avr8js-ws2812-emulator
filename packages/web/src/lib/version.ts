// Replaced at build time by `define` in vite.config.ts; absent when the code runs without Vite's define (tests).
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
export const BUILD_DATE = typeof __BUILD_DATE__ === "string" ? __BUILD_DATE__ : "";
