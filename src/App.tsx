import { Navigate, Route, Routes } from "react-router-dom";

// SignUp
import SignUp from "./pages/SignUp";
import Welcome from "./pages/SignUp/Welcome";
import Questionnaire from "./pages/SignUp/Questionnaire";
import SlotSelect from "./pages/SignUp/SlotSelect";
import Thanks from "./pages/SignUp/Thanks";

// TV
import TV from "./pages/TV";

function App() {
  return (
    <Routes>
      <Route index element={<Navigate to="signup" replace />} />
      <Route path="signup" element={<SignUp />}>
        {/* <Route index element={<Navigate to="welcome" replace />} /> */}
        <Route path="welcome" element={<Welcome />} />
        <Route path="questionnaire" element={<Questionnaire />} />
        <Route path="slotSelect" element={<SlotSelect />} />
        <Route path="thanks" element={<Thanks />} />
      </Route>
      <Route path="tv" element={<TV />} />
    </Routes>
  );
}

export default App;
