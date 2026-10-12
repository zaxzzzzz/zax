"use client";

import React from "react";
import LoginPage from "../../src/components/LoginPage";
import { AuthProvider } from "../../src/contexts/AuthContext";

export default function LoginPageRoute() {
  return (
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );
}
