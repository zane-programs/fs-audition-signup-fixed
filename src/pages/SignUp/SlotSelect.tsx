import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalendarPanel,
  Weekday_Names_Short,
  Month_Names_Short,
} from "chakra-dayzed-datepicker";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { useWindowDimensions } from "../../utils/hooks";
import { parseDate } from "../../utils/date";
import { format, startOfDay } from "date-fns";
import {
  getSignUpInfo,
  reserveSlot,
  type SUGSignUpInfo,
  type SUGSlot,
} from "../../utils/sug";
import type { IconType } from "react-icons";
import {
  MdLocationPin,
  MdCalendarMonth,
  MdTimer,
  MdEmail,
} from "react-icons/md";
import { useFormContext } from "react-hook-form";
import BowtieIcon from "../../components/BowtieIcon";
import RichText from "../../components/RichText";
import { useNavigate } from "react-router";

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

export default function SlotSelect() {
  const [signUpInfo, setSignUpInfo] = useState<SUGSignUpInfo | undefined>();
  const [date, setDate] = useState<Date | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();

  const loadSignUpInfo = useCallback(async () => {
    setLoadError(undefined);
    try {
      const info = await getSignUpInfo();
      setSignUpInfo(info);

      // Auto-select first available date in calendar
      // (Shows slots immediately rather than an awkward interstitial message)
      setDate((current) =>
        current !== undefined
          ? current
          : startOfDay(
              parseDate(info.DATA.slotMetadata.calendarView.firstMonthWithSlots)
            )
      );
    } catch (e) {
      console.error(e);
      setLoadError(
        e instanceof Error ? e.message : "Could not load audition slots"
      );
    }
  }, []);

  useEffect(() => {
    loadSignUpInfo();
  }, [loadSignUpInfo]);

  if (loadError) {
    return (
      <FullPageMessage
        title="Couldn't Load Slots"
        description={`${loadError}\nPlease grab a Fleet Street member for help.`}
      />
    );
  }

  return signUpInfo ? (
    <SignUpView
      signUpInfo={signUpInfo}
      date={date}
      setDate={setDate}
      reloadSignUpInfo={loadSignUpInfo}
    />
  ) : (
    <Loading />
  );
}

function SignUpView({
  signUpInfo,
  date,
  setDate,
  reloadSignUpInfo,
}: {
  signUpInfo: SUGSignUpInfo;
  date: Date | undefined;
  setDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  reloadSignUpInfo: () => Promise<void>;
}) {
  const { height } = useWindowDimensions();

  const [slot, setSlot] = useState<Slot | undefined>();

  const [confirmSlotDialogIsOpen, setConfirmSlotDialogIsOpen] = useState(false);

  const handleOnDateSelected = useCallback(
    (props: {
      date: Date;
      nextMonth: boolean;
      prevMonth: boolean;
      selectable: boolean;
      selected: boolean;
      today: boolean;
    }) => {
      const { date } = props;
      if (date instanceof Date && !isNaN(date.getTime())) {
        setDate(date);
      }
    },
    [setDate]
  );

  const slotsForDate: Slot[] = useMemo(() => {
    if (!date) return [];

    const startTime = startOfDay(date).getTime();

    return Object.values(signUpInfo.DATA.slots)
      .filter(
        (slot: SUGSlot) =>
          startOfDay(parseDate(slot.starttime)).getTime() === startTime &&
          !slot.items[0]?.qtyTaken
      )
      .map((slot: SUGSlot) => ({
        id: slot.slotid,
        startTime: parseDate(slot.starttime),
        endTime: parseDate(slot.endtime),
        location: slot.location,
        isTaken: !!slot.items[0].qtyTaken,
        item: slot.items[0],
      }))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [date, signUpInfo.DATA.slots]);

  useEffect(() => {
    // Confirm slot on select
    slot && setConfirmSlotDialogIsOpen(true);
  }, [slot]);

  return (
    <>
      <Flex style={{ height }} className="fadeOnce">
        <Flex
          direction="column"
          h="100%"
          w="400px"
          flexShrink={0}
          background="#fff2"
          px="8"
          pt="28"
          pb="8"
          gap="4"
          position="relative"
          overflowY="auto"
          className="scrollbarVisible"
        >
          <BowtieIcon />
          <Heading fontSize="x-large" textAlign="center">
            Audition Dates
          </Heading>
          <CalendarPanel
            dayzedHookProps={{
              showOutsideDays: true,
              onDateSelected: handleOnDateSelected,
              selected: date,
              minDate: startOfDay(
                parseDate(
                  signUpInfo.DATA.slotMetadata.calendarView.firstMonthWithSlots
                )
              ),
              maxDate: startOfDay(
                parseDate(
                  signUpInfo.DATA.slotMetadata.calendarView.lastMonthWithSlots
                )
              ),
            }}
            configs={{
              dateFormat: "yyyy-MM-dd",
              monthNames: Month_Names_Short,
              dayNames: Weekday_Names_Short,
              firstDayOfWeek: 0,
            }}
            propsConfigs={{
              dayOfMonthBtnProps: {
                defaultBtnProps: {
                  _hover: {
                    background: "red.400",
                  },
                  _active: {
                    background: "red.800",
                  },
                  sx: {
                    "&:disabled": {
                      background: "transparent !important",
                    },
                  },
                },
                selectedBtnProps: {
                  background: "red.600 !important",
                },
              },
            }}
          />
          {signUpInfo.DATA.header?.description && (
            <Flex direction="column" gap="3" mt="2" pt="6" borderTop="1px solid #fff3">
              <Heading fontSize="lg" textAlign="center">
                What to Expect
              </Heading>
              <RichText html={signUpInfo.DATA.header.description} />
            </Flex>
          )}
        </Flex>
        {date ? (
          slotsForDate.length > 0 ? (
            <Flex
              key={date.getTime()}
              className="fadeOnce"
              direction="column"
              flex={1}
              p="8"
              height="100%"
              overflow="hidden"
              gap="6"
            >
              <Heading size="lg" as="h1" px="1">
                {format(date, "EEEE, MMMM d")}
              </Heading>
              <Flex
                w="100%"
                flex={1}
                overflow="scroll"
                className="scrollbarVisible"
                p="1"
                pr="3"
                gap="3"
                direction="column"
              >
                {slotsForDate.map((currentSlot) => (
                  <SlotButton
                    key={currentSlot.id}
                    currentSlot={currentSlot}
                    selectedSlot={slot}
                    setSelectedSlot={setSlot}
                  />
                ))}
              </Flex>
            </Flex>
          ) : (
            <FullPageMessage
              title="No Slots Available"
              description={
                "There are no slots available for the selected date.\nPlease select another date from the calendar on the left."
              }
            />
          )
        ) : (
          <Flex justifyContent="center" alignItems="center" flex={1} h="100%">
            <Spinner size="xl" />
          </Flex>
        )}
      </Flex>
      <ConfirmSlotDialog
        isOpen={confirmSlotDialogIsOpen}
        setIsOpen={setConfirmSlotDialogIsOpen}
        slot={slot}
        setSlot={setSlot}
        reloadSignUpInfo={reloadSignUpInfo}
      />
    </>
  );
}

function SlotButton({
  currentSlot,
  selectedSlot,
  setSelectedSlot,
}: {
  currentSlot: Slot;
  selectedSlot: Slot | undefined;
  setSelectedSlot: React.Dispatch<React.SetStateAction<Slot | undefined>>;
}) {
  return (
    <Box
      fontFamily="body"
      as="button"
      type="button"
      textAlign="left"
      w="100%"
      backgroundColor={currentSlot.id === selectedSlot?.id ? "#fff3" : "#fff0"}
      onClick={() => setSelectedSlot(currentSlot)}
      border="1px solid #fff3"
      borderRadius="lg"
      padding="3"
      outline="none"
      transitionProperty="var(--chakra-transition-property-common)"
      transitionDuration="var(--chakra-transition-duration-normal)"
      _focusVisible={{
        outline: "none",
        boxShadow: "var(--chakra-shadows-outline)",
      }}
    >
      <Heading size="md" as="h3" fontFamily="body" mb="1.5">
        {format(currentSlot.startTime, "h:mm aa")}
      </Heading>
      <Text fontSize="md" color="#fffb">
        {/* Not every slot has a location set on the sheet. */}
        {currentSlot.location && (
          <>
            {currentSlot.location}
            <br />
          </>
        )}
        {format(currentSlot.startTime, "h:mm aa")} &ndash;{" "}
        {format(currentSlot.endTime, "h:mm aa")}
      </Text>
    </Box>
  );
}

function ConfirmSlotDialog({
  isOpen,
  setIsOpen,
  slot,
  setSlot,
  reloadSignUpInfo,
}: {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  slot: Slot | undefined;
  setSlot: React.Dispatch<React.SetStateAction<Slot | undefined>>;
  reloadSignUpInfo: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const { watch } = useFormContext();

  const cancelRef = useRef<HTMLButtonElement>(null);

  const formValues: { [k: string]: string } = watch();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const onClose = useCallback(() => {
    // Clear slot on cancel
    setSlot(undefined);
    setError(undefined);
    setIsOpen(false);
  }, [setSlot, setIsOpen]);

  const handleConfirm = useCallback(async () => {
    // Slot must exist for this to work
    if (!slot) return;

    const { firstName, lastName, pronouns, classYear, dormRoom, email, phone } =
      formValues;

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
        navigate("../thanks");
        return;
      }

      setError(data.error ?? "Something went wrong. Please try another slot.");
      // Someone may have taken the slot while this person was deciding, so
      // pull fresh availability before they pick again.
      await reloadSignUpInfo();
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Something went wrong. Please retry."
      );
    } finally {
      setIsLoading(false);
    }
  }, [formValues, navigate, reloadSignUpInfo, slot]);

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      isCentered
    >
      <AlertDialogOverlay>
        <AlertDialogContent backgroundColor="#252525">
          <AlertDialogHeader
            fontSize="2xl"
            fontWeight="bold"
            fontFamily="heading"
          >
            Confirm Slot
          </AlertDialogHeader>

          <AlertDialogBody>
            {slot && (
              <Box mb="4">
                <Text fontSize="lg" mb="4" fontWeight="500">
                  Please confirm the details below:
                </Text>
                <Flex fontSize="md" direction="column" gap="0.5" mb="4">
                  <ConfirmRow mdIcon={MdEmail}>{formValues.email}</ConfirmRow>
                  <ConfirmRow mdIcon={MdCalendarMonth}>
                    {format(slot.startTime, "EEEE, MMMM d, yyyy")}
                  </ConfirmRow>
                  <ConfirmRow mdIcon={MdTimer}>
                    {format(slot.startTime, "h:mm aa")} &ndash;{" "}
                    {format(slot.endTime, "h:mm aa")}
                  </ConfirmRow>
                  <ConfirmRow mdIcon={MdLocationPin}>
                    {slot.location}
                  </ConfirmRow>
                </Flex>
                <Text fontSize="medium">
                  Once confirmed, you will receive a copy of this information in
                  the email you provided.
                </Text>
                {error && (
                  <Text mt="4" fontSize="medium" fontWeight="600" color="red.300">
                    {error}
                  </Text>
                )}
              </Box>
            )}
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button onClick={onClose} ref={cancelRef} isDisabled={isLoading}>
              Cancel
            </Button>
            <Button
              colorScheme="green"
              onClick={handleConfirm}
              ml={3}
              isLoading={isLoading}
            >
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}

function ConfirmRow({
  mdIcon,
  children,
}: {
  mdIcon: IconType;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="row" gap="2" alignItems="center">
      <Icon as={mdIcon} />
      <Text flex={1}>{children}</Text>
    </Flex>
  );
}

function FullPageMessage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Flex
      flex={1}
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      direction="column"
      gap="6"
    >
      <Heading as="h1" size="2xl">
        {title}
      </Heading>
      {description && (
        <Text fontSize="xl">
          {description.split("\n").map((line, index) => (
            <Fragment key={index + "_" + line}>
              {line}
              <br />
            </Fragment>
          ))}
        </Text>
      )}
    </Flex>
  );
}

function Loading() {
  const { width, height } = useWindowDimensions();

  return (
    <Flex
      className="fadeOnce"
      style={{ width, height }}
      justifyContent="center"
      alignItems="center"
      direction="column"
      gap="5"
    >
      <Spinner size="xl" />
      <Text fontSize="lg" fontWeight="500">
        Loading slots&hellip;
      </Text>
    </Flex>
  );
}
