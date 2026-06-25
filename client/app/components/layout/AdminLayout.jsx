"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import RequireAdmin from "../auth/RequireAdmin";

import "./AdminLayout.css";
import "./Sidebar.css";
import "./Header.css";
import "./Common.css";
import "./Tables.css";

export default function AdminLayout({ children, title = "Dashboard" }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <RequireAdmin>
    <div className="app">
      <Sidebar collapsed={collapsed} />

      <div className={`main ${collapsed ? "expanded" : ""}`}>
        <Header
          title={title}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />

        <main className="page">{children}</main>
      </div>
    </div>
    </RequireAdmin>
  );
}
