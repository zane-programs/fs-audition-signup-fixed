import { Box } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Outlet, useNavigate, useOutletContext } from "react-router";

export interface Slot {
  id: number;
  startTime: Date;
  endTime: Date;
  location: string;
  isTaken: boolean;
  item: {
    itemid: number;
    slotitemid: number;
  };
}

// The time is picked before the questions are answered, so the choice has to
// outlive the slot screen.
interface SignUpContext {
  slot: Slot | undefined;
  setSlot: React.Dispatch<React.SetStateAction<Slot | undefined>>;
}

export function useSignUp() {
  return useOutletContext<SignUpContext>();
}

export default function SignUp() {
  const navigate = useNavigate();
  const formMethods = useForm();

  const [slot, setSlot] = useState<Slot | undefined>();
  const context: SignUpContext = useMemo(() => ({ slot, setSlot }), [slot]);

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
          <Outlet context={context} />
        </Box>
      </form>
    </FormProvider>
  );
}
