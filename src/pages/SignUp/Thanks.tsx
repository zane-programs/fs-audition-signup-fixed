import { Flex, Heading, Text } from "@chakra-ui/react";
import { useWindowDimensions } from "../../utils/hooks";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

export default function Thanks() {
  const navigate = useNavigate();
  const { width, height } = useWindowDimensions();

  const navigationTimeoutRef = useRef<NodeJS.Timeout>();

  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let secondaryTimeout: NodeJS.Timeout;

    navigationTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      secondaryTimeout = setTimeout(() => {
        navigate("../welcome");
      }, 400);
    }, 5000);

    return () => {
      clearTimeout(navigationTimeoutRef.current);
      if (typeof secondaryTimeout !== "undefined")
        clearTimeout(secondaryTimeout);
    };
  }, [navigate]);

  return (
    <Flex
      className="fadeOnce"
      justifyContent="center"
      alignItems="center"
      style={{ width, height }}
    >
      <Flex
        opacity={isVisible ? 1 : 0}
        transition="opacity 370ms linear"
        direction="column"
        w="100%"
        maxWidth="650"
        gap="4"
        textAlign="center"
      >
        <Heading fontSize="8xl">Thank You!</Heading>
        <Text fontSize="xl">
          Please check your email for an audition confirmation.
        </Text>
      </Flex>
    </Flex>
  );
}
