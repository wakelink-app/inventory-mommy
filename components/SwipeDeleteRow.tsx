"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

const PEEK = 88;
const COMMIT = 128;
const SLOP = 10;

type Phase = "idle" | "drag" | "snap" | "leave" | "collapse";

export function SwipeDeleteRow({
  children,
  enabled = true,
  open = false,
  className = "",
  onOpen,
  onClose,
  onDelete,
  onAskDelete,
}: {
  children: ReactNode;
  enabled?: boolean;
  open?: boolean;
  className?: string;
  onOpen?: () => void;
  onClose?: () => void;
  onDelete?: () => void;
  onAskDelete?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const base = useRef(0);
  const axis = useRef<"undecided" | "x" | "y">("undecided");
  const tracking = useRef(false);
  const lastX = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const committed = useRef(false);
  const ignoreClick = useRef(false);
  const onDeleteRef = useRef(onDelete);
  const onAskDeleteRef = useRef(onAskDelete);
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  onDeleteRef.current = onDelete;
  onAskDeleteRef.current = onAskDelete;

  function setX(next: number) {
    offsetRef.current = next;
    setOffset(next);
  }

  function commit() {
    if (committed.current) return;
    if (onAskDeleteRef.current) {
      setPhase("snap");
      setX(0);
      onClose?.();
      onAskDeleteRef.current();
      return;
    }
    committed.current = true;
    const width = rootRef.current?.offsetWidth ?? 400;
    setPhase("leave");
    setX(-width);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
  }

  useEffect(() => {
    if (phase !== "leave") return;
    const timer = window.setTimeout(() => setPhase("collapse"), 260);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "collapse") return;
    const timer = window.setTimeout(() => onDeleteRef.current?.(), 220);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (open || committed.current) return;
    if (offsetRef.current === 0) return;
    setPhase("snap");
    setX(0);
  }, [open]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || committed.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    tracking.current = true;
    axis.current = "undecided";
    startX.current = event.clientX;
    startY.current = event.clientY;
    base.current = offsetRef.current;
    lastX.current = event.clientX;
    lastT.current = event.timeStamp;
    velocity.current = 0;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!tracking.current || committed.current) return;
    const dx = event.clientX - startX.current;
    const dy = event.clientY - startY.current;
    if (axis.current === "undecided") {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      axis.current = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
      if (axis.current === "y") {
        tracking.current = false;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      onOpen?.();
      setPhase("drag");
    }
    if (axis.current !== "x") return;
    const dt = Math.max(1, event.timeStamp - lastT.current);
    velocity.current = (event.clientX - lastX.current) / dt;
    lastX.current = event.clientX;
    lastT.current = event.timeStamp;
    const width = rootRef.current?.offsetWidth ?? 400;
    let next = base.current + dx;
    if (next > 0) next *= 0.12;
    if (next < -width) next = -width;
    setX(next);
  }

  function onPointerUp() {
    if (!tracking.current) return;
    tracking.current = false;
    if (axis.current === "x") ignoreClick.current = true;
    if (committed.current || axis.current !== "x") {
      axis.current = "undecided";
      return;
    }
    axis.current = "undecided";
    const x = offsetRef.current;
    const fast = velocity.current < -0.55;
    if (x < -COMMIT || fast) {
      commit();
      return;
    }
    if (x < -PEEK * 0.45) {
      setPhase("snap");
      setX(-PEEK);
      onOpen?.();
      return;
    }
    setPhase("snap");
    setX(0);
    onClose?.();
  }

  if (!enabled) {
    return <div className="inv-swipe-static">{children}</div>;
  }

  const clipping = phase === "drag" || phase === "leave" || phase === "collapse" || offset < -1;
  const reveal = Math.max(PEEK, Math.abs(Math.min(offset, 0)));

  return (
    <div
      ref={rootRef}
      className={`swipe-delete${phase === "collapse" ? " is-collapse" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className={`swipe-delete-clip${clipping ? " is-clip" : ""}`}>
        <div className="relative">
          <div className="swipe-delete-under" aria-hidden={offset > -24}>
            <button
              type="button"
              className="swipe-delete-action"
              style={{ width: reveal }}
              tabIndex={offset < -24 ? 0 : -1}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                commit();
              }}
            >
              Delete
            </button>
          </div>
          <div
            className="swipe-delete-over"
            style={{
              transform: `translate3d(${offset}px, 0, 0)`,
              transition:
                phase === "drag" || phase === "idle"
                  ? "none"
                  : phase === "leave"
                    ? "transform 0.26s cubic-bezier(0.4, 0, 1, 1)"
                    : "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClickCapture={(event) => {
              if (ignoreClick.current) {
                event.preventDefault();
                event.stopPropagation();
                ignoreClick.current = false;
                return;
              }
              if (offsetRef.current >= -8) return;
              event.preventDefault();
              event.stopPropagation();
              if (!committed.current) {
                setPhase("snap");
                setX(0);
                onClose?.();
              }
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
