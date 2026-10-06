"use client";

import { Guard } from "@/components/shell";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Guard>{children}</Guard>;
}
