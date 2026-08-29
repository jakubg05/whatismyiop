import { useMemo } from "react";
import katex from "katex";

export function KatexMath({ children, block = false }: { children: string; block?: boolean }) {
  const html = useMemo(() => katex.renderToString(children, {
    displayMode: block,
    output: "htmlAndMathml",
    strict: false,
    throwOnError: false,
  }), [block, children]);

  return <span className={block ? "trend-explanation__math trend-explanation__math--block" : "trend-explanation__math"} dangerouslySetInnerHTML={{ __html: html }} />;
}
