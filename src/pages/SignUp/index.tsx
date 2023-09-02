import { Box } from "@chakra-ui/react";
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Outlet, useNavigate } from "react-router";

export default function SignUp() {
  const navigate = useNavigate();
  const formMethods = useForm();

  // Redirect to start of form on first page load
  // (in case someone is in the middle)
  useEffect(() => {
    navigate("welcome", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FormProvider {...formMethods}>
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <Box userSelect="none">
          <Outlet />
        </Box>
      </form>
    </FormProvider>
  );
}
