import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ComparisonExpressionProvider } from "../ComparisonExpressionState";
import { ToastProvider } from "../ToastState";

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
