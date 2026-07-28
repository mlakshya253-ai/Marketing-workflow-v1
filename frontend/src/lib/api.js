import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Also attach a bearer token as fallback (some browsers strip 3rd-party cookies).
let cachedToken = null;
try {
  cachedToken = localStorage.getItem("ch_token");
} catch (e) {
  cachedToken = null;
}

export function setAuthToken(token) {
  cachedToken = token;
  try {
    if (token) localStorage.setItem("ch_token", token);
    else localStorage.removeItem("ch_token");
  } catch (e) {
    // ignore
  }
}

api.interceptors.request.use((config) => {
  if (cachedToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${cachedToken}`;
  }
  return config;
});

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function fileDownloadUrl(fileId) {
  const token = cachedToken || "";
  return `${API_BASE}/files/${fileId}/download${token ? `?auth=${encodeURIComponent(token)}` : ""}`;
}
