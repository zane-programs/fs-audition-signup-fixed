import { useState, useEffect } from "react";
import { getAvailability } from "./sug";

export function useWindowDimensions() {
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    function handleResize() {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    window.addEventListener("resize", handleResize);

    // cleanup this component
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowDimensions;
}

// How often to re-check which slots are still open while someone is signing
// up. Override with REACT_APP_AVAILABILITY_POLL_MS at build time if the sheet
// is filling faster than this keeps up with.
const AVAILABILITY_POLL_MS =
  Number(process.env.REACT_APP_AVAILABILITY_POLL_MS) || 15_000;

/**
 * Slots fill while someone is still deciding — especially with the kiosk and
 * people's phones both pointed at the same sheet. Poll so a slot that's gone
 * disappears from the list, or is flagged on the details screen, instead of
 * failing at the last step.
 */
export function useTakenSlotIds() {
  const [takenSlotIds, setTakenSlotIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    let cancelled = false;

    const checkAvailability = async () => {
      try {
        const { taken } = await getAvailability();
        if (!cancelled) setTakenSlotIds(new Set(taken));
      } catch (e) {
        // A dropped poll is not worth interrupting anyone over; the reserve
        // call re-checks authoritatively before it submits anything.
        console.error("availability poll failed", e);
      }
    };

    checkAvailability();
    const interval = setInterval(checkAvailability, AVAILABILITY_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return takenSlotIds;
}
