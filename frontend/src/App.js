import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Layout from "@/components/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";

import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Home from "@/pages/Home";
import RequestsList from "@/pages/RequestsList";
import NewRequest from "@/pages/NewRequest";
import RequestDetail from "@/pages/RequestDetail";
import Triage from "@/pages/Triage";
import Queue from "@/pages/Queue";
import Inbox from "@/pages/Inbox";
import Dashboard from "@/pages/Dashboard";
import Admin from "@/pages/Admin";
import System from "@/pages/System";

function AppShell({ children }) {
  const { user } = useAuth();
  if (user === null || user === false) return children;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "hsl(var(--card))",
                color: "hsl(var(--card-foreground))",
                border: "1px solid hsl(var(--border))",
              },
            }}
          />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <Home />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/requests"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <RequestsList />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/requests/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <RequestDetail />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/new"
              element={
                <ProtectedRoute roles={["requester", "triage", "writer", "designer", "executive"]}>
                  <AppShell>
                    <NewRequest />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/triage"
              element={
                <ProtectedRoute roles={["triage"]}>
                  <AppShell>
                    <Triage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/queue"
              element={
                <ProtectedRoute roles={["triage", "writer", "designer"]}>
                  <AppShell>
                    <Queue />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/inbox"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <Inbox />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={["triage", "executive"]}>
                  <AppShell>
                    <Dashboard />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={["triage"]}>
                  <AppShell>
                    <Admin />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/system"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <System />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
