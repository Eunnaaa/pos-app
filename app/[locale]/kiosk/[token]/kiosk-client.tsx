"use client";

import { useEffect } from "react";
import { SelfOrderFlow } from "@/components/self-order/self-order-flow";

export function KioskClient({ token }: { token: string }) {
  // Kiosk mode: auto-fullscreen on first tap to comply with browser gesture requirement
  useEffect(() => {
    const enableFullscreen = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        void el.requestFullscreen().catch(() => {});
      }
      window.removeEventListener("click", enableFullscreen);
      window.removeEventListener("touchend", enableFullscreen);
    };
    window.addEventListener("click", enableFullscreen);
    window.addEventListener("touchend", enableFullscreen);
    return () => {
      window.removeEventListener("click", enableFullscreen);
      window.removeEventListener("touchend", enableFullscreen);
    };
  }, []);

  return (
    <div className="kiosk-mode">
      <SelfOrderFlow token={token} variant="kiosk" />
    </div>
  );
}
