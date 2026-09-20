// Thin client for SignUpGenius's internal JSON API (the same one their own
// front end talks to). This replaces the old Puppeteer-driven form filling:
// headless Chromium can't run inside a Vercel serverless function, and driving
// a real browser broke every time SignUpGenius reshuffled their markup.

const SUG_API = "https://www.signupgenius.com/SUGboxAPI.cfm";

const SUG_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/json, text/plain; charset=UTF-8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.signupgenius.com/",
};

/**
 * POST to one of SignUpGenius's `go=` actions.
 * Their API always answers 200, so success lives in the body.
 */
async function sugApi(go, body) {
  const res = await fetch(`${SUG_API}?go=${encodeURIComponent(go)}`, {
    method: "POST",
    headers: SUG_HEADERS,
    body: JSON.stringify(body),
  });

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `SignUpGenius returned a non-JSON response (HTTP ${res.status})`
    );
  }

  return json;
}

/** Full sign-up sheet payload: slots, custom fields, settings. */
async function getSignUpInfo(urlid) {
  const info = await sugApi("s.getSignUpInfo", {
    urlid,
    forSignUpView: true,
    portalid: 0,
  });

  if (!info?.DATA?.slots) {
    throw new Error(sugMessage(info) || "Could not load the sign-up sheet");
  }

  return info;
}

/** Pull the human-readable error out of a SignUpGenius response. */
function sugMessage(response) {
  const message = response?.MESSAGE;
  if (Array.isArray(message)) return message.filter(Boolean).join(" ");
  if (typeof message === "string") return message;
  return "";
}

/**
 * Convert one of SignUpGenius's "September, 22 2026 19:00:00" strings (always
 * in the sheet's local time, Pacific for us) into epoch milliseconds.
 */
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function parseSugTime(input, timeZone = "America/Los_Angeles") {
  const match = /^(\w+),\s*(\d+)\s+(\d+)\s+(\d+):(\d+):(\d+)$/.exec(
    String(input).trim()
  );
  if (!match) return 0;

  const [, monthName, day, year, hour, minute, second] = match;
  const month = MONTHS.indexOf(monthName.toLowerCase());
  if (month < 0) return 0;

  // Treat the wall-clock time as if it were UTC, then subtract the zone's
  // offset at that instant. Done twice so DST boundaries land correctly.
  const asUtc = Date.UTC(+year, month, +day, +hour, +minute, +second);
  const firstPass = asUtc - zoneOffset(asUtc, timeZone);
  return asUtc - zoneOffset(firstPass, timeZone);
}

/** Offset of `timeZone` from UTC at a given instant, in milliseconds. */
function zoneOffset(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));

  const at = {};
  for (const { type, value } of parts) at[type] = value;

  const local = Date.UTC(
    +at.year,
    +at.month - 1,
    +at.day,
    +at.hour,
    +at.minute,
    +at.second
  );

  return local - instant;
}

module.exports = { sugApi, getSignUpInfo, sugMessage, parseSugTime };
