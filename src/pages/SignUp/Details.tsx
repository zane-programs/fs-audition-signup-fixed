import {
  Box,
  Button,
  type ButtonProps,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Icon,
  Input,
  Select,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTakenSlotIds, useWindowDimensions } from "../../utils/hooks";
import { useFormContext } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { format } from "date-fns";
import type { IconType } from "react-icons";
import {
  MdArrowBack,
  MdArrowForward,
  MdCalendarMonth,
  MdCheck,
  MdEmail,
  MdLocationPin,
  MdTimer,
} from "react-icons/md";

// BroadcastChannel for TV
import { tvIntercom } from "../TV";
import BowtieIcon from "../../components/BowtieIcon";
import { reserveSlot } from "../../utils/sug";
import { type Slot, useSignUp } from ".";

const QUIET = "#ffffffc7";
const HAIRLINE = "#ffffff38";

interface Field {
  name: string;
  label: string;
  inputType: React.HTMLInputTypeAttribute | "select";
  placeholder?: string;
  // Shown once someone has left the field with something invalid in it
  hint?: string;
  isValid?: (value: string) => boolean;
  options?: { [id: string]: string };
}

function validateStanfordEmail(email: string): boolean {
  if (
    !String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      )
  )
    return false;

  const domain = email.split("@")[1];
  const stanfordDomains = ["stanford.edu", ".stanford.edu"];
  const domainParts = domain.split(".");
  const stanfordCheck = domainParts.slice(domainParts.length - 2).join(".");

  return stanfordDomains.includes(stanfordCheck);
}

const STEPS: { title: string; fields: Field[] }[] = [
  {
    title: "First, who are you?",
    fields: [
      { name: "firstName", label: "First name", inputType: "text" },
      { name: "lastName", label: "Last name", inputType: "text" },
      {
        name: "pronouns",
        label: "Pronouns",
        inputType: "text",
        placeholder: "e.g. she/they",
      },
      {
        name: "email",
        label: "Stanford email",
        inputType: "email",
        placeholder: "you@stanford.edu",
        hint: "This needs to be your @stanford.edu address.",
        isValid: validateStanfordEmail,
      },
    ],
  },
  {
    title: "Almost there",
    fields: [
      {
        name: "classYear",
        label: "Class year",
        inputType: "select",
        placeholder: "Select class year",
        options: {
          Frosh: "Freshman",
          Soph: "Sophomore",
          Junior: "Junior",
          Senior: "Senior",
          Coterm: "Coterm/Fifth Year",
          GradStudent: "Graduate Student",
          Other: "Other",
        },
      },
      {
        name: "dormRoom",
        label: "Dorm and room number",
        inputType: "text",
        placeholder: "e.g. Twain East, 250",
      },
      {
        name: "phone",
        label: "Phone number",
        inputType: "tel",
        placeholder: "e.g. (650) 555-0123",
        hint: "Include the area code: 10 digits in all.",
        // SignUpGenius requires a phone number on this year's sheet.
        isValid: (phone: string) =>
          (phone ?? "").replace(/\D/g, "").length >= 10,
      },
    ],
  },
];

const fieldIsValid = (field: Field, value: string) =>
  field.isValid ? field.isValid(value ?? "") : !!value?.trim();

export default function Details() {
  const navigate = useNavigate();
  const { height } = useWindowDimensions();
  const { slot } = useSignUp();
  const { watch } = useFormContext();
  const values: { [k: string]: string } = watch();

  // Someone sent back to pick another time has already answered everything;
  // drop them at the first step that still needs something from them.
  const [stepIndex, setStepIndex] = useState(() => {
    const unfinished = STEPS.findIndex((s) =>
      s.fields.some((f) => !fieldIsValid(f, values[f.name]))
    );
    return unfinished === -1 ? STEPS.length - 1 : unfinished;
  });
  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const stepIsValid = step.fields.every((f) => fieldIsValid(f, values[f.name]));

  // The slot isn't held while these questions are answered, so keep watching
  // the sheet: better to hear it's gone now than after the last field.
  const takenSlotIds = useTakenSlotIds();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Our own sign-up marks the slot taken on the next poll. Don't let that read
  // back as "someone beat you to it" in the moment before we navigate away.
  const hasSucceeded = useRef(false);
  const slotWasTaken =
    !!slot && takenSlotIds.has(String(slot.id)) && !hasSucceeded.current;

  const announcedName = useRef<string>();

  const changeTime = useCallback(() => navigate("../slotSelect"), [navigate]);

  const handleConfirm = useCallback(async () => {
    if (!slot) return;

    const { firstName, lastName, pronouns, classYear, dormRoom, email, phone } =
      values;

    // Show loading state
    setIsLoading(true);
    setError(undefined);

    try {
      // Attempt signup
      const data = await reserveSlot(slot.id.toString(), {
        firstName,
        lastName,
        pronouns,
        classYear,
        dormRoom,
        email,
        phone,
      });

      if (data.data === "success") {
        // Success => Thanks
        hasSucceeded.current = true;
        navigate("../thanks");
        return;
      }

      setError(data.error ?? "Something went wrong. Please try another time.");
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Something went wrong. Please retry."
      );
    } finally {
      setIsLoading(false);
    }
  }, [navigate, slot, values]);

  const handleNext = useCallback(() => {
    if (!stepIsValid || isLoading) return;

    if (isLastStep) {
      if (!slotWasTaken) handleConfirm();
      return;
    }

    // Fun gag to show the person's name on the TV as they're signing up
    if (stepIndex === 0 && announcedName.current !== values.firstName) {
      announcedName.current = values.firstName;
      tvIntercom.postMessage({
        action: "showUserOverlay",
        name: values.firstName,
      });
    }

    setStepIndex((prev) => prev + 1);
  }, [
    handleConfirm,
    isLastStep,
    isLoading,
    slotWasTaken,
    stepIndex,
    stepIsValid,
    values.firstName,
  ]);

  // Nothing to book without a time (e.g. the page was reloaded part-way)
  if (!slot) return <Navigate to="../slotSelect" replace />;

  return (
    <Flex direction="column" style={{ minHeight: height }} className="fadeOnce">
      <ChosenSlotBar slot={slot} onChange={changeTime} isDisabled={isLoading} />

      <Flex flex={1} justifyContent="center" alignItems="center" px="10" py="8">
        <Flex
          key={stepIndex}
          className="fadeOnce"
          direction="column"
          w="100%"
          maxW="820px"
          gap="8"
        >
          <Box>
            <Text fontSize="lg" fontWeight="500" color={QUIET} mb="1">
              Step {stepIndex + 1} of {STEPS.length}
            </Text>
            <Heading as="h1" fontSize="48px" lineHeight="1.1">
              {step.title}
            </Heading>
          </Box>

          <StepFields fields={step.fields} onEnter={handleNext} />

          {isLastStep && !(slotWasTaken || error) && (
            <BookingSummary slot={slot} email={values.email} />
          )}

          {isLastStep && (slotWasTaken || error) && (
            <Box
              role="alert"
              border="2px solid"
              borderColor="red.400"
              borderRadius="xl"
              px="5"
              py="4"
            >
              <Text fontSize="xl" fontWeight="700" color="red.200">
                {slotWasTaken
                  ? `Someone just took ${format(slot.startTime, "h:mm aa")}.`
                  : error}
              </Text>
              <Text fontSize="lg" mt="1">
                Your answers are saved: pick another time and you'll come
                straight back here.
              </Text>
              <NavButton mt="4" flex="none" onClick={changeTime}>
                Pick another time
              </NavButton>
            </Box>
          )}

          <Flex as="nav" gap="4">
            {stepIndex > 0 && (
              <NavButton
                flex="none"
                px="8"
                leftIcon={<Icon as={MdArrowBack} />}
                isDisabled={isLoading}
                onClick={() => setStepIndex((prev) => prev - 1)}
              >
                Back
              </NavButton>
            )}
            {isLastStep ? (
              <NavButton
                isPrimary
                rightIcon={<Icon as={MdCheck} />}
                isDisabled={!stepIsValid || slotWasTaken}
                isLoading={isLoading}
                loadingText="Signing you up"
                onClick={handleNext}
              >
                Sign me up
              </NavButton>
            ) : (
              <NavButton
                isPrimary
                rightIcon={<Icon as={MdArrowForward} />}
                isDisabled={!stepIsValid}
                onClick={handleNext}
              >
                Next
              </NavButton>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
}

function ChosenSlotBar({
  slot,
  onChange,
  isDisabled,
}: {
  slot: Slot;
  onChange: () => void;
  isDisabled: boolean;
}) {
  return (
    <Flex
      alignItems="center"
      gap="5"
      px="10"
      py="4"
      background="#161616"
      borderBottom={`1px solid ${HAIRLINE}`}
    >
      <BowtieIcon position="static" transform="none" w="64px" flexShrink={0} />
      <Box flex={1} minW={0}>
        <Text fontSize="md" fontWeight="500" color={QUIET}>
          Your audition
        </Text>
        <Text fontSize="2xl" fontWeight="700" lineHeight="1.25">
          {format(slot.startTime, "EEEE, MMMM d")} at{" "}
          {format(slot.startTime, "h:mm aa")}
        </Text>
      </Box>
      <Button
        type="button"
        variant="outline"
        size="lg"
        borderColor={HAIRLINE}
        borderWidth="2px"
        color="#fff"
        _hover={{ background: "#fff", color: "#000", borderColor: "#fff" }}
        isDisabled={isDisabled}
        onClick={onChange}
      >
        Change time
      </Button>
    </Flex>
  );
}

function StepFields({
  fields,
  onEnter,
}: {
  fields: Field[];
  onEnter: () => void;
}) {
  const { register, watch, setValue } = useFormContext();
  const values: { [k: string]: string } = watch();

  const gridRef = useRef<HTMLDivElement>(null);
  const [touched, setTouched] = useState<{ [name: string]: boolean }>({});

  useEffect(() => {
    // Selects need an explicit empty value for their placeholder to show
    fields.forEach((field) => {
      if (field.inputType === "select" && !values[field.name])
        setValue(field.name, "");
    });

    // Put the cursor where the typing starts
    gridRef.current?.querySelector<HTMLElement>("input, select")?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      // Enter walks down the form, and submits the step from the last field
      const controls = Array.from(
        gridRef.current?.querySelectorAll<HTMLElement>("input, select") ?? []
      );
      const next = controls[controls.indexOf(e.currentTarget) + 1];
      next ? next.focus() : onEnter();
    },
    [onEnter]
  );

  return (
    <SimpleGrid ref={gridRef} columns={2} spacingX="6" spacingY="6">
      {fields.map((field, index) => {
        const { onBlur, ...registration } = register(field.name);
        const showHint =
          !!field.hint &&
          touched[field.name] &&
          !!values[field.name] &&
          !fieldIsValid(field, values[field.name]);
        // An odd field out spans the row rather than leaving a hole
        const spansRow = fields.length % 2 === 1 && index === fields.length - 1;

        const shared = {
          size: "lg" as const,
          h: "64px",
          fontSize: "22px",
          color: "#000",
          backgroundColor: "#fff",
          border: "3px solid transparent",
          _hover: {},
          _focusVisible: {
            borderColor: "red.500",
            boxShadow: "0 0 0 3px var(--chakra-colors-red-500)",
          },
          onKeyDown,
          onBlur: (e: React.FocusEvent) => {
            setTouched((prev) => ({ ...prev, [field.name]: true }));
            return onBlur(e);
          },
          ...registration,
        };

        return (
          <FormControl key={field.name} gridColumn={spansRow ? "1 / -1" : undefined}>
            <FormLabel fontSize="xl" fontWeight="600" mb="2">
              {field.label}
            </FormLabel>
            {field.inputType === "select" ? (
              <Select {...shared} iconColor="#000">
                {field.placeholder && (
                  <option value="" disabled>
                    {field.placeholder}
                  </option>
                )}
                {field.options &&
                  Object.entries(field.options).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </Select>
            ) : (
              <Input
                {...shared}
                type={field.inputType}
                placeholder={field.placeholder}
                _placeholder={{ color: "#5a5a5a" }}
                _selection={{ backgroundColor: "#0af8" }}
              />
            )}
            {showHint && (
              <Text fontSize="lg" fontWeight="500" color="red.200" mt="2">
                {field.hint}
              </Text>
            )}
          </FormControl>
        );
      })}
    </SimpleGrid>
  );
}

function BookingSummary({ slot, email }: { slot: Slot; email: string }) {
  return (
    <Box
      border={`1px solid ${HAIRLINE}`}
      borderRadius="xl"
      background="#161616"
      px="6"
      py="5"
    >
      <Text fontSize="lg" fontWeight="500" color={QUIET} mb="3">
        Check this over before you sign up
      </Text>
      <SimpleGrid columns={2} spacingX="6" spacingY="2.5" fontSize="xl">
        <SummaryRow mdIcon={MdCalendarMonth}>
          {format(slot.startTime, "EEEE, MMMM d, yyyy")}
        </SummaryRow>
        <SummaryRow mdIcon={MdTimer}>
          {format(slot.startTime, "h:mm aa")} &ndash;{" "}
          {format(slot.endTime, "h:mm aa")}
        </SummaryRow>
        {/* Not every slot has a location set on the sheet. */}
        {slot.location && (
          <SummaryRow mdIcon={MdLocationPin}>{slot.location}</SummaryRow>
        )}
        <SummaryRow mdIcon={MdEmail}>{email}</SummaryRow>
      </SimpleGrid>
      <Text fontSize="lg" color={QUIET} mt="4">
        Once you sign up, a copy of this is sent to that email.
      </Text>
    </Box>
  );
}

function SummaryRow({
  mdIcon,
  children,
}: {
  mdIcon: IconType;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="row" gap="3" alignItems="center" minW={0}>
      <Icon as={mdIcon} boxSize="6" color={QUIET} flexShrink={0} />
      <Text flex={1} minW={0} fontWeight="600" wordBreak="break-word">
        {children}
      </Text>
    </Flex>
  );
}

function NavButton({
  isPrimary,
  ...props
}: ButtonProps & { isPrimary?: boolean }) {
  return (
    <Button
      type="button"
      flex={1}
      h="68px"
      fontSize="2xl"
      fontFamily="heading"
      fontWeight="700"
      color={isPrimary ? "#fff" : "#111"}
      backgroundColor={isPrimary ? "red.600" : "#eee"}
      _hover={{
        backgroundColor: isPrimary ? "red.500" : "#fff",
        _disabled: { backgroundColor: isPrimary ? "red.600" : "#eee" },
      }}
      _active={{ backgroundColor: isPrimary ? "red.700" : "#ddd" }}
      _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
      {...props}
    />
  );
}
