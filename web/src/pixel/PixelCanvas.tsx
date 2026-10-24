import { useEffect, useRef, type PointerEvent } from 'react';

interface Props {
  width: number; // logical pixels; CSS scales the canvas up with crisp edges
  height: number;
  draw: (g: CanvasRenderingContext2D, now: number) => void;
  className?: string;
  onPointerDown?: (e: PointerEvent<HTMLCanvasElement>, x: number, y: number) => void;
  onPointerUp?: (e: PointerEvent<HTMLCanvasElement>, x: number, y: number) => void;
}

// A low-res canvas redrawn every animation frame.
export default function PixelCanvas({ width, height, draw, className, onPointerDown, onPointerUp }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    let raf = 0;
    const loop = (now: number) => {
      g.clearRect(0, 0, width, height);
      drawRef.current(g, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  // Convert a pointer position into logical canvas pixels.
  const toLogical = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height] as const;
  };

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={`pixel-canvas ${className ?? ''}`}
      onPointerDown={onPointerDown && (e => onPointerDown(e, ...toLogical(e)))}
      onPointerUp={onPointerUp && (e => onPointerUp(e, ...toLogical(e)))}
    />
  );
}
