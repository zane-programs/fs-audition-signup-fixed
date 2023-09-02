// import { mode } from "@chakra-ui/theme-tools";
import { extendTheme } from "@chakra-ui/theme-utils";

const theme = extendTheme({
  styles: {
    global: {
      body: {
        color: "#fff",
        bg: "#000",
      },
    },
  },
  config: { initialColorMode: "dark", useSystemColorMode: false },
  fonts: {
    heading: "'Playfair Display', serif",
    body: "'Inter', sans-serif",
  },
  components: {
    Heading: {
      baseStyle: {
        fontWeight: "700",
      },
    },
    // Button: { baseStyle: { fontFamily: "heading" } },
  },
});

export default theme;
