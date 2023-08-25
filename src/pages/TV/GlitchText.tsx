import { Box, BoxProps } from "@chakra-ui/react";

import styles from "./TV.module.css";

export default function GlitchText({ children, ...props }: BoxProps) {
  return (
    <Box {...props} position="relative">
      <p className={styles.glitch}>
        <span aria-hidden>{children}</span>
        {children}
        <span aria-hidden>{children}</span>
      </p>
    </Box>
  );
}
