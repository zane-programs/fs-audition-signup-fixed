import { Button, Flex } from "@chakra-ui/react";
import FSLogo from "../../components/FSLogo";
import { useWindowDimensions } from "../../utils/hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useFormContext } from "react-hook-form";

export default function Welcome() {
  const navigate = useNavigate();
  const { width, height } = useWindowDimensions();
  const { reset } = useFormContext();

  const [pageHidden, setPageHidden] = useState(true);

  const navigationTimeoutRef = useRef<NodeJS.Timeout>();

  const handleStart = useCallback(() => {
    setPageHidden(true);
    navigationTimeoutRef.current = setTimeout(() => {
      navigate("../questionnaire");
    }, 300);
  }, [navigate]);

  useEffect(() => {
    // Reset form values
    reset();

    // Show page on render
    setPageHidden(false);

    return () => {
      clearTimeout(navigationTimeoutRef.current);
    };
  }, [reset]);

  return (
    <Flex
      justifyContent="center"
      alignItems="center"
      transform={pageHidden ? "scale(0)" : "scale(1)"}
      opacity={pageHidden ? 0 : 1}
      pointerEvents={pageHidden ? "none" : undefined}
      transition="all 235ms ease-in-out"
      style={{ width, height }}
    >
      <Flex direction="column" w="100%" maxWidth="650" gap="4">
        <FSLogo
          onDoubleClick={() => {
            document.documentElement.requestFullscreen({
              navigationUI: "hide",
            });
          }}
        />
        <Button
          type="button"
          size="lg"
          fontSize="3xl"
          py="8"
          px="12"
          fontFamily="heading"
          fontWeight="700"
          color="#fff"
          backgroundColor="red.600"
          _hover={{ backgroundColor: "red.500" }}
          _active={{ backgroundColor: "red.700" }}
          onClick={handleStart}
        >
          Start
        </Button>
      </Flex>
    </Flex>
  );
}
