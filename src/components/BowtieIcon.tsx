import { useState } from "react";
import { Box } from "@chakra-ui/react";
import bowtie_icon from "../assets/media/bowtie_icon.webp";

export default function BowtieIcon() {
  const [loaded, setLoaded] = useState(false);
  return (
    <Box
      w="120px"
      position="absolute"
      top="4"
      left="50%"
      transform="translateX(-50%)"
      opacity={loaded ? 1 : 0}
      transition="opacity 375ms ease"
      onDragStart={(e) => e.preventDefault()}
    >
      <img
        style={{ width: "100%" }}
        src={bowtie_icon}
        alt="Fleet Street Logo"
        onLoad={() => setLoaded(true)}
      />
    </Box>
  );
}
