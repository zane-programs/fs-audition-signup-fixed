// Client for our own /api/sug/* serverless functions, which in turn talk to
// SignUpGenius. Nothing here hits SignUpGenius directly — the browser can't,
// because of CORS.

// TODO: Update this each year when a new sign-up sheet is created.
// Grab it from the sheet's URL: signupgenius.com/go/<URL_ID>
export const URL_ID = "10C0E44A9AF2AABFEC52-65642443-fleet";

export interface SUGUser {
  firstName: string;
  lastName: string;
  pronouns: string;
  classYear: string;
  dormRoom: string;
  email: string;
  phone: string;
}

export interface SUGSlot {
  slotid: number;
  starttime: string;
  endtime: string;
  location: string;
  usetime: number;
  items: {
    itemid: number;
    slotitemid: number;
    item: string;
    qtyTaken: number | "";
  }[];
}

export interface SUGSignUpInfo {
  DATA: {
    slots: { [slotId: string]: SUGSlot };
    slotMetadata: {
      calendarView: {
        firstMonthWithSlots: string;
        lastMonthWithSlots: string;
      };
    };
    signuplocked: boolean;
    expired: boolean;
  };
}

export async function getSignUpInfo(): Promise<SUGSignUpInfo> {
  return await _fetchSug<SUGSignUpInfo>("s.getSignUpInfo", {
    forSignUpView: true,
    portalid: 0,
  });
}

export interface ReserveResult {
  data: "success" | "error";
  error?: string;
}

export async function reserveSlot(
  slotId: string,
  user: SUGUser
): Promise<ReserveResult> {
  return await _fetchSug<ReserveResult>(
    "reserve/" + encodeURIComponent(slotId),
    user,
    // A rejected slot (taken, closed, bad email) is an expected outcome, not a
    // crash — hand it back so the dialog can show the reason.
    { allowErrorResponse: true }
  );
}

async function _fetchSug<T = any>(
  input: string,
  body: Object = {},
  { allowErrorResponse = false } = {}
): Promise<T> {
  const res = await fetch(
    "/api/sug/" + encodeURIComponent(URL_ID) + "/" + input,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const json = await res.json().catch(() => undefined);

  if (!res.ok && !allowErrorResponse) {
    throw new Error(json?.error || `Request failed (HTTP ${res.status})`);
  }

  if (!res.ok) {
    return {
      data: "error",
      error: json?.error || `Request failed (HTTP ${res.status})`,
    } as T;
  }

  return json as T;
}
