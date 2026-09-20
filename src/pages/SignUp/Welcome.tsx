import { Box, Button, Flex, Heading } from "@chakra-ui/react";
import FSLogo from "../../components/FSLogo";
import { useWindowDimensions } from "../../utils/hooks";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useFormContext } from "react-hook-form";
import { useSignUp } from ".";

// three.js is only needed here, so keep it out of the main bundle.
const AttractCanvas = lazy(() => import("./attract/AttractCanvas"));

function goFullscreen() {
  document.documentElement.requestFullscreen({ navigationUI: "hide" });
}

export default function Welcome() {
  const navigate = useNavigate();
  const { width, height } = useWindowDimensions();
  const { reset } = useFormContext();
  const { setSlot } = useSignUp();

  const [pageHidden, setPageHidden] = useState(true);
  const [useFallback, setUseFallback] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  const navigationTimeoutRef = useRef<NodeJS.Timeout>();

  const handleStart = useCallback(() => {
    setPageHidden(true);
    navigationTimeoutRef.current = setTimeout(() => {
      navigate("../slotSelect");
    }, 300);
  }, [navigate]);

  useEffect(() => {
    // Reset the last person's answers
    reset();
    setSlot(undefined);

    // Show page on render
    setPageHidden(false);

    return () => {
      clearTimeout(navigationTimeoutRef.current);
    };
  }, [reset, setSlot]);

  const fallback = (
    <StaticWelcome onStart={handleStart} />
  );

  return (
    <Box
      position="relative"
      opacity={pageHidden ? 0 : 1}
      pointerEvents={pageHidden ? "none" : undefined}
      transition="opacity 280ms ease-in-out"
      style={{ width, height }}
      onDoubleClick={goFullscreen}
    >
      {useFallback ? (
        fallback
      ) : (
        <Suspense fallback={null}>
          <AttractCanvas
            onStart={handleStart}
            onUnsupported={() => setUseFallback(true)}
          />
        </Suspense>
      )}
    </Box>
  );
}

/** Shown when WebGL isn't available, or the visitor asks for less motion. */
function StaticWelcome({ onStart }: { onStart: () => void }) {
  return (
    <Flex h="100%" justifyContent="center" alignItems="center">
      <Flex direction="column" w="100%" maxWidth="650" gap="4" px="6">
        <Heading
          as="h1"
          fontSize="3xl"
          fontWeight="900"
          letterSpacing="0.2em"
          textAlign="center"
        >
          AUDITION FOR
        </Heading>
        <FSLogo />
        <Button
          type="button"
          size="lg"
          fontSize="3xl"
          py="8"
          px="12"
          fontFamily="heading"
          fontWeight="900"
          letterSpacing="0.2em"
          color="#fff"
          backgroundColor="red.600"
          _hover={{ backgroundColor: "red.500" }}
          _active={{ backgroundColor: "red.700" }}
          onClick={onStart}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          START
        </Button>
      </Flex>
    </Flex>
  );
}
