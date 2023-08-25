import React from "react";
import { Route, Routes } from "react-router-dom";

import TV from "./pages/TV";

function App() {
  return (
    <Routes>
      <Route path="tv" element={<TV />} />
    </Routes>
  );
}

export default App;
