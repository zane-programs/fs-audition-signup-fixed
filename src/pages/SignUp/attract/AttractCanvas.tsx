import { useEffect, useRef } from "react";
import { Box } from "@chakra-ui/react";
import AttractScene from "./AttractScene";

/**
 * The WebGL attract loop, plus the one real control on it.
 *
 * START is painted inside the canvas so it can change colour with everything
 * else, which leaves nothing for a finger, a keyboard or a screen reader to
 * land on. So an invisible <button> is kept pinned over the painted one.
 */
export default function AttractCanvas({
  onStart,
  onUnsupported,
}: {
  onStart: () => void;
  onUnsupported: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<AttractScene>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: AttractScene;
    try {
      scene = new AttractScene(canvas);
    } catch (e) {
      console.error("attract screen unavailable", e);
      onUnsupported();
      return;
    }
    sceneRef.current = scene;
    scene.start();

    // The camera drifts, so the painted button drifts; follow it.
    let frame = 0;
    const follow = () => {
      frame = requestAnimationFrame(follow);
      const button = buttonRef.current;
      if (!button) return;
      const rect = scene.getStartRect();
      button.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      button.style.width = `${rect.width}px`;
      button.style.height = `${rect.height}px`;
    };
    frame = requestAnimationFrame(follow);

    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      scene.dispose();
      sceneRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box position="absolute" inset="0" overflow="hidden">
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
        aria-hidden
      />
      <Box
        as="h1"
        position="absolute"
        w="1px"
        h="1px"
        overflow="hidden"
        clipPath="inset(50%)"
      >
        Audition for Fleet Street
      </Box>
      <Box
        as="button"
        ref={buttonRef}
        type="button"
        aria-label="Start"
        position="absolute"
        top="0"
        left="0"
        background="transparent"
        cursor="pointer"
        borderRadius="md"
        outline="none"
        _focusVisible={{ boxShadow: "0 0 0 4px #fff, 0 0 0 8px #000" }}
        onClick={onStart}
        onMouseEnter={() => sceneRef.current?.setHover(true)}
        onMouseLeave={() => sceneRef.current?.setHover(false)}
        // Double-clicking the screen is how the kiosk goes full screen; don't
        // let a double-tap on START count as that too.
        onDoubleClick={(e: React.MouseEvent) => e.stopPropagation()}
      />
    </Box>
  );
}
