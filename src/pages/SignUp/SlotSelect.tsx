import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarPanel,
  Weekday_Names_Short,
  Month_Names_Short,
} from "chakra-dayzed-datepicker";
import { Box, Flex, Heading, Spinner, Text } from "@chakra-ui/react";
import { useTakenSlotIds, useWindowDimensions } from "../../utils/hooks";
import { parseDate } from "../../utils/date";
import { addDays, differenceInMinutes, format, startOfDay } from "date-fns";
import {
  getSignUpInfo,
  type SUGSignUpInfo,
  type SUGSlot,
} from "../../utils/sug";
import BowtieIcon from "../../components/BowtieIcon";
import RichText from "../../components/RichText";
import { useNavigate } from "react-router";
import { type Slot, useSignUp } from ".";

// Secondary text. Still 12:1 against black: this runs outdoors, after dark.
const QUIET = "#ffffffc7";
const HAIRLINE = "#ffffff38";

export default function SlotSelect() {
  const { slot } = useSignUp();

  const [signUpInfo, setSignUpInfo] = useState<SUGSignUpInfo | undefined>();
  // Coming back to change a time lands on the day that was picked before.
  const [date, setDate] = useState<Date | undefined>(() =>
    slot ? startOfDay(slot.startTime) : undefined
  );
  const [loadError, setLoadError] = useState<string | undefined>();
  const takenSlotIds = useTakenSlotIds();

  const loadSignUpInfo = useCallback(async () => {
    setLoadError(undefined);
    try {
      setSignUpInfo(await getSignUpInfo());
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
      takenSlotIds={takenSlotIds}
    />
  ) : (
    <Loading />
  );
}

interface Day {
  date: Date;
  slots: Slot[];
}

function SignUpView({
  signUpInfo,
  date,
  setDate,
  takenSlotIds,
}: {
  signUpInfo: SUGSignUpInfo;
  date: Date | undefined;
  setDate: React.Dispatch<React.SetStateAction<Date | undefined>>;
  takenSlotIds: Set<string>;
}) {
  const { height } = useWindowDimensions();
  const navigate = useNavigate();
  const { slot: chosenSlot, setSlot } = useSignUp();

  // Every day on the sheet, with the slots still open on it.
  const days: Day[] = useMemo(() => {
    const byDay = new Map<number, Day>();

    Object.values(signUpInfo.DATA.slots).forEach((slot: SUGSlot) => {
      const startTime = parseDate(slot.starttime);
      const dayStart = startOfDay(startTime);
      const day = byDay.get(dayStart.getTime()) ?? { date: dayStart, slots: [] };
      byDay.set(dayStart.getTime(), day);

      if (slot.items[0]?.qtyTaken || takenSlotIds.has(String(slot.slotid)))
        return;

      day.slots.push({
        id: slot.slotid,
        startTime,
        endTime: parseDate(slot.endtime),
        location: slot.location,
        isTaken: false,
        item: slot.items[0],
      });
    });

    return Array.from(byDay.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((day) => ({
        ...day,
        slots: day.slots.sort(
          (a, b) => a.startTime.getTime() - b.startTime.getTime()
        ),
      }));
  }, [signUpInfo.DATA.slots, takenSlotIds]);

  // Open on the first day that still has room
  // (Shows slots immediately rather than an awkward interstitial message)
  useEffect(() => {
    if (date || days.length === 0) return;
    setDate((days.find((day) => day.slots.length > 0) ?? days[0]).date);
  }, [date, days, setDate]);

  const selectedDay = useMemo(
    () => days.find((day) => day.date.getTime() === date?.getTime()),
    [days, date]
  );

  // Only days that are actually on the sheet can be picked in the calendar.
  const disabledDates = useMemo(() => {
    const disabled = new Set<number>();
    if (days.length === 0) return disabled;
    const onSheet = new Set(days.map((day) => day.date.getTime()));
    const last = days[days.length - 1].date;
    for (let d = days[0].date; d <= last; d = addDays(d, 1)) {
      if (!onSheet.has(d.getTime())) disabled.add(d.getTime());
    }
    return disabled;
  }, [days]);

  // Say the venue and length once up top when every slot agrees on them,
  // rather than repeating them on every button.
  const allSlots = useMemo(() => days.flatMap((day) => day.slots), [days]);
  const sharedLocation = useMemo(() => {
    const locations = new Set(allSlots.map((s) => s.location));
    return locations.size === 1 ? allSlots[0].location : undefined;
  }, [allSlots]);
  const sharedMinutes = useMemo(() => {
    const lengths = new Set(
      allSlots.map((s) => differenceInMinutes(s.endTime, s.startTime))
    );
    return lengths.size === 1 ? Array.from(lengths)[0] : undefined;
  }, [allSlots]);

  const handleOnDateSelected = useCallback(
    ({ date }: { date: Date }) => {
      if (date instanceof Date && !isNaN(date.getTime())) {
        setDate(startOfDay(date));
      }
    },
    [setDate]
  );

  const handleSlotSelected = useCallback(
    (slot: Slot) => {
      setSlot(slot);
      navigate("../details");
    },
    [navigate, setSlot]
  );

  return (
    <Flex style={{ height }} className="fadeOnce">
      <Flex direction="column" flex={1} minW={0} h="100%" px="12" pt="9">
        <Flex as="header" alignItems="center" gap="5" mb="7">
          <BowtieIcon position="static" transform="none" w="84px" flexShrink={0} />
          <Box>
            <Heading as="h1" fontSize="40px" lineHeight="1.15">
              Pick your audition time
            </Heading>
            {(sharedLocation || sharedMinutes) && (
              <Text fontSize="xl" color={QUIET} mt="1.5">
                {sharedMinutes && `Each audition is ${sharedMinutes} minutes`}
                {sharedMinutes && sharedLocation && ", "}
                {sharedLocation &&
                  `${sharedMinutes ? "at" : "Auditions are at"} ${sharedLocation}`}
                .
              </Text>
            )}
          </Box>
        </Flex>

        <Flex role="tablist" aria-label="Audition days" gap="3" overflowX="auto" flexShrink={0} p="1" m="-1">
          {days.map((day) => (
            <DayTab
              key={day.date.getTime()}
              day={day}
              isSelected={day === selectedDay}
              onSelect={() => setDate(day.date)}
            />
          ))}
        </Flex>

        {selectedDay ? (
          selectedDay.slots.length > 0 ? (
            <Flex
              key={selectedDay.date.getTime()}
              className="fadeOnce scrollbarVisible"
              role="tabpanel"
              direction="column"
              flex={1}
              minH={0}
              overflowY="auto"
              mt="6"
              pb="10"
              pr="4"
            >
              {groupByHour(selectedDay.slots).map(([hour, slots]) => (
                <Flex
                  key={hour}
                  gap="6"
                  py="4"
                  borderTop={`1px solid ${HAIRLINE}`}
                  alignItems="flex-start"
                >
                  <Heading
                    as="h2"
                    fontSize="2xl"
                    w="92px"
                    flexShrink={0}
                    // Sits on the first row of buttons' centre line
                    lineHeight="64px"
                    color={QUIET}
                  >
                    {hour}
                  </Heading>
                  <Flex wrap="wrap" gap="3">
                    {slots.map((slot) => (
                      <SlotButton
                        key={slot.id}
                        slot={slot}
                        showLocation={!sharedLocation}
                        isChosen={slot.id === chosenSlot?.id}
                        onSelect={handleSlotSelected}
                      />
                    ))}
                  </Flex>
                </Flex>
              ))}
            </Flex>
          ) : (
            <FullPageMessage
              title="This day is full"
              description="Every audition on this day has been taken. Try another day above."
            />
          )
        ) : date ? (
          <FullPageMessage
            title="No auditions this day"
            description="Pick one of the days above."
          />
        ) : (
          <Flex justifyContent="center" alignItems="center" flex={1}>
            <Spinner size="xl" />
          </Flex>
        )}
      </Flex>

      <Flex
        as="aside"
        direction="column"
        h="100%"
        w="460px"
        flexShrink={0}
        background="#161616"
        borderLeft={`1px solid ${HAIRLINE}`}
        px="9"
        py="9"
        gap="8"
        overflowY="auto"
        className="scrollbarVisible"
      >
        {days.length > 0 && (
          <CalendarPanel
            disabledDates={disabledDates}
            dayzedHookProps={{
              showOutsideDays: true,
              onDateSelected: handleOnDateSelected,
              selected: date,
              // Re-anchor the visible month when a tab changes the day
              date,
              minDate: days[0].date,
              maxDate: days[days.length - 1].date,
            }}
            configs={{
              dateFormat: "yyyy-MM-dd",
              monthNames: Month_Names_Short,
              dayNames: Weekday_Names_Short,
              firstDayOfWeek: 0,
            }}
            propsConfigs={{
              dateHeadingProps: { fontSize: "xl", fontWeight: "700" },
              weekdayLabelProps: { color: QUIET, fontSize: "sm" },
              dayOfMonthBtnProps: {
                defaultBtnProps: {
                  fontSize: "lg",
                  fontWeight: "700",
                  color: "#fff",
                  h: "44px",
                  _hover: {
                    background: "red.400",
                  },
                  _active: {
                    background: "red.800",
                  },
                  sx: {
                    "&:disabled": {
                      background: "transparent !important",
                      color: "#ffffff59",
                      fontWeight: "400",
                      opacity: 1,
                    },
                  },
                },
                selectedBtnProps: {
                  background: "red.600 !important",
                },
              },
            }}
          />
        )}
        {signUpInfo.DATA.header?.description && (
          <Flex direction="column" gap="4">
            <Heading as="h2" fontSize="28px">
              What to expect
            </Heading>
            <RichText html={signUpInfo.DATA.header.description} />
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}

function groupByHour(slots: Slot[]): [string, Slot[]][] {
  const groups = new Map<string, Slot[]>();
  slots.forEach((slot) => {
    const hour = format(slot.startTime, "h aa");
    groups.set(hour, [...(groups.get(hour) ?? []), slot]);
  });
  return Array.from(groups.entries());
}

function DayTab({
  day,
  isSelected,
  onSelect,
}: {
  day: Day;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const open = day.slots.length;

  return (
    <Box
      as="button"
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onSelect}
      textAlign="left"
      flexShrink={0}
      minW="220px"
      px="5"
      py="3.5"
      borderRadius="xl"
      border="2px solid"
      borderColor={isSelected ? "red.600" : HAIRLINE}
      backgroundColor={isSelected ? "red.600" : "transparent"}
      outline="none"
      transitionProperty="var(--chakra-transition-property-common)"
      transitionDuration="var(--chakra-transition-duration-normal)"
      _hover={isSelected ? undefined : { borderColor: "#fff" }}
      _focusVisible={{ boxShadow: "0 0 0 3px #fff" }}
    >
      <Heading as="span" display="block" fontSize="26px" lineHeight="1.2">
        {format(day.date, "EEEE")}
      </Heading>
      <Text fontSize="lg" mt="0.5" color={isSelected ? "#fff" : QUIET}>
        {format(day.date, "MMMM d")}, {open === 0 ? "full" : `${open} open`}
      </Text>
    </Box>
  );
}

function SlotButton({
  slot,
  showLocation,
  isChosen,
  onSelect,
}: {
  slot: Slot;
  showLocation: boolean;
  isChosen: boolean;
  onSelect: (slot: Slot) => void;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={() => onSelect(slot)}
      aria-label={`${format(slot.startTime, "h:mm aa")} to ${format(
        slot.endTime,
        "h:mm aa"
      )}`}
      minW="140px"
      minH="64px"
      px="5"
      py="2"
      borderRadius="lg"
      border="2px solid"
      borderColor={isChosen ? "#fff" : HAIRLINE}
      backgroundColor={isChosen ? "#fff" : "#ffffff12"}
      color={isChosen ? "#000" : "#fff"}
      outline="none"
      transitionProperty="var(--chakra-transition-property-common)"
      transitionDuration="var(--chakra-transition-duration-fast)"
      _hover={{ backgroundColor: "#fff", borderColor: "#fff", color: "#000" }}
      _active={{ transform: "scale(0.97)" }}
      _focusVisible={{ boxShadow: "0 0 0 3px var(--chakra-colors-red-500)" }}
    >
      <Text as="span" display="block" fontSize="22px" fontWeight="700">
        {format(slot.startTime, "h:mm")}
        <Text as="span" fontSize="md" fontWeight="500" ml="1.5">
          {format(slot.startTime, "aa")}
        </Text>
      </Text>
      {/* Not every slot has a location set on the sheet. */}
      {showLocation && slot.location && (
        <Text as="span" display="block" fontSize="sm" fontWeight="500">
          {slot.location}
        </Text>
      )}
    </Box>
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
      minH="60vh"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      direction="column"
      gap="5"
      px="8"
    >
      <Heading as="h1" size="2xl">
        {title}
      </Heading>
      {description && (
        <Text fontSize="xl" color={QUIET}>
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
      <Text fontSize="xl" fontWeight="500">
        Loading audition times&hellip;
      </Text>
    </Flex>
  );
}
