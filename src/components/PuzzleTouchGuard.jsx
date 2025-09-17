// src/components/PuzzleTouchGuard.jsx
import React, { useEffect, useRef } from "react";

/**
 * PuzzleTouchGuard
 * Wrap your puzzle grid with this to stop the page from scrolling/zooming
 * while the user interacts with the puzzle area on touch devices.
 *
 * Props:
 *  - lockScroll?: boolean   // if true, also prevents body scrolling while mounted
 *  - className?: string
 *  - style?: React.CSSProperties
 */
export default function PuzzleTouchGuard({
  lockScroll = false,
  className = "",
  style = {},
  children,
  ...rest
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // For iOS Safari: we must use non-passive listeners to call preventDefault()
    // and suppress page panning/zooming while interacting inside the puzzle.
    const cancelTouch = (e) => {
      // Allow default behavior on form fields
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      // If the event started inside our element, prevent page scroll/zoom
      if (el.contains(e.target)) {
        e.preventDefault();
      }
    };

    // Pointer Events (newer browsers). If supported, this plus CSS 'touch-action: none' is usually enough.
    const hasPointer = window.PointerEvent != null;

    if (hasPointer) {
      // Nothing to attach here; CSS handles most.
      // We still attach touch listeners as a safety for iOS edge cases.
    }

    // Critical for iOS: preventDefault on touchmove/touchstart with passive:false
    el.addEventListener("touchstart", cancelTouch, { passive: false });
    el.addEventListener("touchmove", cancelTouch, { passive: false });

    // Optional: prevent double-tap zoom on quick repeated taps
    let lastTouchEnd = 0;
    const onTouchEnd = (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300 && el.contains(e.target)) {
        e.preventDefault(); // suppress double-tap zoom
      }
      lastTouchEnd = now;
    };
    el.addEventListener("touchend", onTouchEnd, { passive: false });

    // Optionally prevent BODY scroll while the guard is mounted
    const originalOverflow = document.body.style.overflow;
    if (lockScroll) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      el.removeEventListener("touchstart", cancelTouch);
      el.removeEventListener("touchmove", cancelTouch);
      el.removeEventListener("touchend", onTouchEnd);
      if (lockScroll) document.body.style.overflow = originalOverflow;
    };
  }, [lockScroll]);

  // The CSS classes applied here do most of the heavy lifting.
  const classes =
    "puzzle-touch-guard " +
    (className || "");

  return (
    <div
      ref={ref}
      className={classes}
      style={style}
      // help older Android WebViews: mark this region as not draggable/selectable
      draggable={false}
      {...rest}
    >
      {children}
    </div>
  );
}
