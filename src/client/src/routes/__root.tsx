import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ToastProvider } from "../app/toast/ToastState";
import { ComparisonExpressionProvider } from "../features/comparison";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ToastProvider>
      <ComparisonExpressionProvider>
        <div className="app-layout">
          <Outlet />
        </div>
      </ComparisonExpressionProvider>
    </ToastProvider>
  );
}
