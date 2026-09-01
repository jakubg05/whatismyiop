import { useCallback, useEffect, useRef, useState } from "react";
import { navigateWheelDomain, type TimeDomain } from "./chartNavigation";

export function useChartViewport(
  domain: TimeDomain,
  onDomainChange: (domain: TimeDomain) => void,
  plotInsets: { left: number; right: number },
) {
  const chartRef = useRef<HTMLDivElement>(null);
  const domainRef = useRef(domain);
  const pendingDomainRef = useRef<TimeDomain | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const [width, setWidth] = useState(0);

  domainRef.current = domain;

  const changeDomain = useCallback(
    (nextDomain: TimeDomain) => {
      domainRef.current = nextDomain;
      onDomainChange(nextDomain);
    },
    [onDomainChange],
  );

  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();

      const bounds = element!.getBoundingClientRect();
      const plotWidth = Math.max(
        1,
        bounds.width - plotInsets.left - plotInsets.right,
      );
      const deltaUnit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? bounds.height
            : 1;
      const currentDomain = domainRef.current;
      const nextDomain = navigateWheelDomain(
        currentDomain,
        null,
        event.shiftKey ? "zoom" : "pan",
        event.deltaX * deltaUnit,
        event.deltaY * deltaUnit,
        (event.clientX - bounds.left - plotInsets.left) / plotWidth,
        plotWidth,
      );
      if (
        nextDomain[0] === currentDomain[0] &&
        nextDomain[1] === currentDomain[1]
      )
        return;

      domainRef.current = nextDomain;
      pendingDomainRef.current = nextDomain;
      if (wheelFrameRef.current === null) {
        wheelFrameRef.current = window.requestAnimationFrame(() => {
          wheelFrameRef.current = null;
          if (pendingDomainRef.current)
            onDomainChange(pendingDomainRef.current);
          pendingDomainRef.current = null;
        });
      }
    }

    element.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });
    return () => {
      element.removeEventListener("wheel", handleWheel, { capture: true });
      if (wheelFrameRef.current !== null)
        window.cancelAnimationFrame(wheelFrameRef.current);
    };
  }, [onDomainChange, plotInsets.left, plotInsets.right]);

  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const updateWidth = () => setWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { chartRef, width, changeDomain };
}
