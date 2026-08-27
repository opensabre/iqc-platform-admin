import axios, { type AxiosResponse } from "axios";

const http = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API || "/api",
  timeout: 20_000,
  withCredentials: true,
});

function redirectToLogin() {
  localStorage.removeItem("iqc-access-token");
  if (window.location.pathname === "/login") return;

  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const target = `/login?redirect=${encodeURIComponent(redirect || "/dashboard")}`;
  // 多个接口可能同时发现 session 过期，只允许第一个请求触发页面跳转。
  if (window.location.href !== `${window.location.origin}${target}`) {
    window.location.replace(target);
  }
}

function isAuthenticationPage(response: AxiosResponse) {
  const headerGetter = response.headers?.get;
  const contentType = String(typeof headerGetter === "function"
    ? headerGetter.call(response.headers, "content-type") || ""
    : response.headers?.["content-type"] || "");
  const responseUrl = response.request?.responseURL || "";
  const body = typeof response.data === "string" ? response.data.trim().slice(0, 300).toLowerCase() : "";
  const isHtml = contentType.includes("text/html") || body.startsWith("<!doctype html") || body.startsWith("<html");
  const isApiRequest = response.config?.url?.startsWith("/") ?? false;
  const isOauthPage = /\/oauth2\/authorize|\/login(?:[/?#]|$)/i.test(responseUrl);
  return isApiRequest && isHtml && (isOauthPage || !responseUrl);
}

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("iqc-access-token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use((response) => {
  if (isAuthenticationPage(response)) {
    redirectToLogin();
    return Promise.reject(new Error("当前会话已过期"));
  }
  const body = response.data;
  if (body && typeof body === "object" && "code" in body && "data" in body) {
    const successCode = String(body.code) === "000000" || String(body.code) === "0" || String(body.code) === "200";
    if (!successCode) return Promise.reject(new Error(body.msg || body.mesg || "请求失败"));
    response.data = body.data;
  }
  return response;
}, (error) => {
  if (error.response?.status === 401) {
    redirectToLogin();
  }
  return Promise.reject(error);
});

export default http;
