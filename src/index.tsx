import ReactDOM from "react-dom/client";
import App from "./App";

import { ChakraProvider, createLocalStorageManager } from "@chakra-ui/react";
import theme from "./theme";
import { BrowserRouter } from "react-router-dom";

const colorModeManager = createLocalStorageManager("fs-color-mode");

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <BrowserRouter>
    <ChakraProvider colorModeManager={colorModeManager} theme={theme}>
      <App />
    </ChakraProvider>
  </BrowserRouter>
);
