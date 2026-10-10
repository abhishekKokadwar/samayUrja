/**
 * api.js — Fetch wrappers for the Murmuration API.
 *
 * All functions return parsed JSON or throw an Error with a human-readable message.
 * The base URL is set via the VITE_API_URL env variable (defaults to localhost:8000).
 */

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function _request(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const resp = await fetch(`${BASE}${path}`, opts);
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const data = await resp.json();
      detail = data.detail || JSON.stringify(data);
    } catch (_) {}
    throw new Error(detail);
  }
  return resp.json();
}

export const api = {
  getTariffs: () => _request("GET", "/tariffs"),
  optimize: (profile) => _request("POST", "/optimize", profile),
  saveHousehold: (id, profile) => _request("PUT", `/households/${id}`, profile),
  loadHousehold: (id) => _request("GET", `/households/${id}`),
  simulate: (scenario) => _request("POST", "/simulate", scenario),
  hostingCapacity: (scenario) => _request("POST", "/hosting-capacity", scenario),
  health: () => _request("GET", "/health"),
};
