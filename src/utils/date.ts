import { parse } from "date-fns";
import { zonedTimeToUtc } from "date-fns-tz";

export function parseDate(
  input: string,
  timeZone: string = "America/Los_Angeles", // Default Pacific time
  format: string = "MMMM, dd yyyy HH:mm:ss"
): Date {
  // Parse the date as UTC
  const date = parse(input, format, new Date());

  // Convert the date to the Pacific timezone
  const pacificDate = zonedTimeToUtc(date, timeZone);

  return pacificDate;
}
