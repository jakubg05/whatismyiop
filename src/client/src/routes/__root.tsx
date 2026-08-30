import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ComparisonExpressionProvider } from "../ComparisonExpressionState";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ComparisonExpressionProvider>
      <div className="app-layout">
        <Outlet />
      </div>
    </ComparisonExpressionProvider>
  );
}
