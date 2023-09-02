import {
  Box,
  Button,
  type ButtonProps,
  Flex,
  Heading,
  Icon,
  Input,
  Select,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "../../utils/hooks";
import { useFormContext } from "react-hook-form";
import { useNavigate } from "react-router";

// BroadcastChannel for TV
import { tvIntercom } from "../TV";
import { MdArrowBack, MdArrowForward } from "react-icons/md";
import BowtieIcon from "../../components/BowtieIcon";

interface Question {
  name: string;
  title: string;
  inputType: React.HTMLInputTypeAttribute | "select";
  inputPlaceholder?: string;
  nextButtonText?: string;
  onNext?: (value: string) => void;
  isValid?: (value: string) => boolean;
  options?: { [id: string]: string };
}

const QUESTIONS: Question[] = [
  {
    name: "firstName",
    title: "What is your first name?",
    inputType: "text",
    inputPlaceholder: "First Name",
    // Fun gag to show the person's name on the TV as they're signing up
    onNext: (firstName: string) => {
      tvIntercom.postMessage({ action: "showUserOverlay", name: firstName });
    },
  },
  {
    name: "lastName",
    title: "What is your last name?",
    inputType: "text",
    inputPlaceholder: "Last Name",
  },
  {
    name: "pronouns",
    title: "What are your pronouns?",
    inputType: "text",
    inputPlaceholder: "e.g. she/they",
  },
  {
    name: "classYear",
    title: "What is your class year?",
    inputType: "select",
    inputPlaceholder: "Select Class Year",
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
    title: "What is your dorm and room number?",
    inputType: "text",
    inputPlaceholder: "e.g. Twain East, 250",
  },
  {
    name: "email",
    title: "What is your Stanford email?",
    inputType: "email",
    inputPlaceholder: "your.email@stanford.edu",
    isValid: function validateStanfordEmail(email: string): boolean {
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
    },
  },
];

export default function Questionnaire() {
  const navigate = useNavigate();
  const { width, height } = useWindowDimensions();

  const [questionIndex, setQuestionIndex] = useState(0);

  const handleNext = useCallback(() => {
    // Go to next question (or `SlotSelect`)
    setQuestionIndex((prev) => {
      if (prev + 1 === QUESTIONS.length) {
        navigate("../slotSelect");
        return prev;
      } else {
        return prev + 1;
      }
    });
  }, [navigate]);

  const handlePrev = useCallback(() => {
    // Go to previous question
    setQuestionIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  return (
    <>
      <BowtieIcon />
      <Flex
        style={{ width, height }}
        justifyContent="center"
        alignItems="center"
        textAlign="center"
      >
        <QuestionView
          key={questionIndex}
          questionIndex={questionIndex}
          handleNext={handleNext}
          handlePrev={handlePrev}
        />
      </Flex>
    </>
  );
}

function QuestionView({
  questionIndex,
  handleNext,
  handlePrev,
}: {
  questionIndex: number;
  handleNext: () => void;
  handlePrev: () => void;
}) {
  const question = useMemo(() => QUESTIONS[questionIndex], [questionIndex]);

  const { watch, register, setValue } = useFormContext();
  const values = watch();

  const inputContainerRef = useRef<HTMLDivElement>(null);

  const isValid = useMemo(
    () =>
      question.isValid
        ? question.isValid(values[question.name])
        : !!values[question.name],
    [question, values]
  );

  const onNextClick = useCallback(() => {
    // Run custom `onNext` action, if provided
    // (and provide text value)
    question.onNext?.(values[question.name]);

    // Go to next question
    handleNext();
  }, [handleNext, question, values]);

  useEffect(() => {
    // Set value at start
    if (question.inputType === "select") {
      !values[question.name] && setValue(question.name, "");
    } else {
      (inputContainerRef.current?.children[0] as HTMLInputElement).focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.inputType, question.name]);

  const onKeyDown = useCallback(
    (e: any) => {
      // Run next if valid on enter
      if (e?.key === "Enter" && isValid) {
        e.preventDefault();
        onNextClick();
      }
    },
    [isValid, onNextClick]
  );

  return (
    <Flex
      className="fadeOnce"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      direction="column"
      gap="8"
      w="100%"
    >
      <Heading as="h1" size="xl" mb="2">
        {question.title}
      </Heading>
      <Flex
        maxW="500px"
        direction="column"
        w="100%"
        alignItems="center"
        gap="6"
      >
        {question.inputType === "select" ? (
          <Select
            color="#000"
            backgroundColor="#dfdfdf"
            onKeyDown={onKeyDown}
            {...register(question.name)}
          >
            {question.inputPlaceholder && (
              <option value="" disabled>
                {question.inputPlaceholder}
              </option>
            )}
            {question.options &&
              Object.entries(question.options).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </Select>
        ) : (
          <Box w="100%" ref={inputContainerRef}>
            <Input
              color="#000"
              backgroundColor="#dfdfdf"
              _placeholder={{ color: "#444" }}
              _selection={{ backgroundColor: "#0af8" }}
              type={question.inputType}
              placeholder={question.inputPlaceholder}
              onKeyDown={onKeyDown}
              {...register(question.name)}
            />
          </Box>
        )}
        <Flex as="nav" w="100%" gap="4">
          {questionIndex > 0 && (
            <QuestionNavButton
              leftIcon={<Icon as={MdArrowBack} />}
              onClick={handlePrev}
            >
              Previous
            </QuestionNavButton>
          )}
          <QuestionNavButton
            isDisabled={!isValid}
            rightIcon={<Icon as={MdArrowForward} />}
            onClick={onNextClick}
          >
            Next
          </QuestionNavButton>
        </Flex>
      </Flex>
    </Flex>
  );
}

function QuestionNavButton(props: ButtonProps) {
  return (
    <Button
      flex={1}
      backgroundColor="#eee !important"
      color="#111 !important"
      opacity="0.9"
      _hover={{ ":not(:disabled)": { opacity: "1" } }}
      _active={{ ":not(:disabled)": { opacity: "0.85" } }}
      size="lg"
      fontSize="xl"
      fontFamily="heading"
      fontWeight="700"
      {...props}
    />
  );
}
