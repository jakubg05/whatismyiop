import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type ComparisonExpressionState = {
  expression: string;
  setExpression: (expression: string) => void;
  clearExpression: () => void;
};

const Context = createContext<ComparisonExpressionState | null>(null);

export function ComparisonExpressionProvider({ children }: { children: ReactNode }) {
  const [expression, setExpression] = useState("");
  const value = useMemo(() => ({ expression, setExpression, clearExpression: () => setExpression("") }), [expression]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useComparisonExpression(): ComparisonExpressionState {
  const value = useContext(Context);
  if (!value) throw new Error("useComparisonExpression must be used inside ComparisonExpressionProvider");
  return value;
}
