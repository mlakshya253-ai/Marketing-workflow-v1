import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuthToken, formatApiErrorDetail } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=anonymous, obj=user
  const [systemInfo, setSystemInfo] = useState(null);

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch (e) {
      setUser(false);
    }
  }, []);

  const refreshSystem = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/system");
      setSystemInfo(data);
    } catch (e) {
      setSystemInfo({ total_users: 0, admin_exists: false, first_admin_needed: false });
    }
  }, []);

  useEffect(() => {
    loadMe();
    refreshSystem();
  }, [loadMe, refreshSystem]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.access_token) setAuthToken(data.access_token);
    setUser(data.user);
    await refreshSystem();
    return data.user;
  };

  const register = async (email, password, name) => {
    const { data } = await api.post("/auth/register", { email, password, name });
    if (data.access_token) setAuthToken(data.access_token);
    setUser(data.user);
    await refreshSystem();
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // ignore
    }
    setAuthToken(null);
    setUser(false);
  };

  const claimAdmin = async () => {
    const { data } = await api.post("/auth/claim-admin", {});
    setUser(data.user);
    await refreshSystem();
    return data.user;
  };

  return (
    <AuthContext.Provider value={{ user, systemInfo, login, register, logout, claimAdmin, refreshSystem, loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export { formatApiErrorDetail };
