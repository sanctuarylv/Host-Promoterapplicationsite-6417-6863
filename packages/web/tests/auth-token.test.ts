import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { AUTH_TOKEN_KEY, clearAuthToken, getAuthToken, setAuthToken } from "../src/web/lib/auth-token";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

test("token key matches installed managed-auth client", () => {
  const source = readFileSync(import.meta.resolve("@runablehq/managed-auth/client").replace("file://", ""), "utf8");
  expect(source).toContain(AUTH_TOKEN_KEY);
});

test("set, get and clear share one storage key", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } });
  setAuthToken("test-token");
  expect(values.get(AUTH_TOKEN_KEY)).toBe("test-token");
  expect(getAuthToken()).toBe("test-token");
  clearAuthToken();
  expect(getAuthToken()).toBe("");
});

test("unavailable storage never throws", () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
  expect(getAuthToken()).toBe("");
  expect(() => setAuthToken("test")).not.toThrow();
  expect(() => clearAuthToken()).not.toThrow();
});