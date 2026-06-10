import { useState, useRef, useCallback, useEffect } from 'react';

const ROW_HEIGHT = 48;
const OVERSCAN = 10;

export function useVirtualList(itemCount, containerRef) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height || 800);
      }
    });
    obs.observe(el);
    setContainerHeight(el.clientHeight || 800);
    return () => obs.disconnect();
  }, [containerRef]);

  const onScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(itemCount, startIdx + visibleCount);
  const totalHeight = itemCount * ROW_HEIGHT;
  const offsetY = startIdx * ROW_HEIGHT;

  return { onScroll, startIdx, endIdx, totalHeight, offsetY, ROW_HEIGHT };
}
