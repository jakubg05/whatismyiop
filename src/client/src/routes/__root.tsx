import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ToastProvider } from "../app/toast/ToastProvider";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ToastProvider>
      <div className="app-layout">
        <Outlet />
      </div>
    </ToastProvider>
  );
}
