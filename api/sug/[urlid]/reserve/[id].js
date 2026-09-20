const {
  sugApi,
  getSignUpInfo,
  getSlotParticipants,
  deleteItemMember,
  slotCapacity,
  sugMessage,
  parseSugTime,
} = require("../../../_lib/signupgenius");

// Fields the kiosk questionnaire collects. All are required by the sheet.
const SLOT_TAKEN = "Someone just took that slot. Please pick another.";

// We raced, lost, and successfully undid our own sign-up.
const SLOT_RACE_LOST =
  "Someone signed up for that slot at the same moment you did, so you have " +
  "not been signed up. Please pick another time.";

// We raced, lost, and could not undo it — so we must not claim otherwise.
const SLOT_RACE_STUCK =
  "Someone signed up for that slot at the same moment you did. Please pick " +
  "another time, and let a Fleet Street member know.";

// Only ever undo a sign-up made in the last few minutes: a safety belt so a
// name collision with someone who signed up yesterday can't delete them.
const ROLLBACK_WINDOW_MS = 5 * 60 * 1000;

const REQUIRED_FIELDS = [
  "firstName",
  "lastName",
  "pronouns",
  "classYear",
  "dormRoom",
  "email",
  "phone",
];

/**
 * Reserve one audition slot.
 *
 * POST /api/sug/:urlid/reserve/:slotId
 *
 * The client only sends the slot id and the person's answers; everything else
 * (item ids, times, the sheet's custom-field ids) is read back from
 * SignUpGenius at request time, so the sheet can be rebuilt each year without
 * touching this file.
 */
async function handleReserve(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "Method not allowed");
  }

  const urlid = String(req.query.urlid || "");
  const slotId = String(req.query.id || "");

  if (!urlid || !slotId) {
    return fail(res, 400, "Missing sign-up id or slot id");
  }

  const body = req.body || {};
  const missing = REQUIRED_FIELDS.filter(
    (field) => !String(body[field] ?? "").trim()
  );
  if (missing.length) {
    return fail(res, 400, `Missing ${missing.join(", ")}`);
  }

  const user = {};
  for (const field of REQUIRED_FIELDS) user[field] = String(body[field]).trim();

  try {
    const info = await getSignUpInfo(urlid);
    const data = info.DATA;

    if (data.signuplocked || data.expired) {
      return fail(res, 409, "This sign-up is closed");
    }

    const slot = data.slots[slotId];
    if (!slot) {
      return fail(res, 404, "That slot no longer exists. Please pick another.");
    }

    const item = slot.items?.[0];
    if (!item) {
      return fail(res, 409, "That slot has no audition available.");
    }
    const capacity = slotCapacity(item);

    // `qtyTaken` comes off the sheet-wide read and lags fresh sign-ups, so it
    // only catches the easy cases. The per-slot lookup below is authoritative.
    if (Number(item.qtyTaken || 0) >= capacity) {
      return fail(res, 409, SLOT_TAKEN);
    }

    const before = await getSlotParticipants(urlid, data.id, item.slotitemid);
    if (before.length >= capacity) {
      return fail(res, 409, SLOT_TAKEN);
    }

    const customFields = buildCustomFields(data.customfields, user);
    if (customFields.error) {
      return fail(res, 500, customFields.error);
    }

    const response = await sugApi(
      "s.processSignUpFormHandler",
      buildSignUpPayload({ urlid, data, slot, item, user, customFields: customFields.fields })
    );

    if (response?.SUCCESS === false) {
      // SignUpGenius' own validation message is the most useful thing we can
      // show the person standing at the kiosk.
      return fail(res, 400, sugMessage(response) || "Sign-up was rejected");
    }

    // SignUpGenius does not enforce slot capacity on this path — it will
    // happily put a second person on a slot that holds one. The window is now
    // only as wide as the request above, but it is not zero, so read the slot
    // back and make sure we actually won it.
    const after = await getSlotParticipants(urlid, data.id, item.slotitemid);

    if (after.length > capacity) {
      const ours = findOurSignUp(after, user);
      const winners = [...after].sort(bySignUpOrder).slice(0, capacity);
      const weLost =
        ours && !winners.some((w) => w.itemmemberid === ours.itemmemberid);

      if (weLost) {
        const rolledBack = await rollBack(
          urlid,
          data.id,
          item.slotitemid,
          ours
        );

        console.error(
          "lost slot race",
          JSON.stringify({
            slotId,
            email: user.email,
            itemmemberid: ours.itemmemberid,
            onSlot: after.length,
            capacity,
            rolledBack,
          })
        );

        return fail(res, 409, rolledBack ? SLOT_RACE_LOST : SLOT_RACE_STUCK);
      }

      // We hold the slot but someone else landed on it too. Nothing to do from
      // here, so make sure it's visible to whoever reads the logs.
      console.error(
        "slot double-booked",
        JSON.stringify({ slotId, onSlot: after.length, capacity })
      );
    }

    console.log(
      "reserved",
      JSON.stringify({ slotId, email: user.email, onSlot: after.length })
    );

    return res.status(200).json({ data: "success" });
  } catch (e) {
    console.error("reserve failed", e);
    return fail(res, 502, e?.message || "Could not reach SignUpGenius");
  }
}

/**
 * Fill in the sheet's custom fields from the questionnaire answers, matching
 * on the field's type/name rather than a hard-coded id.
 */
function buildCustomFields(customfields, user) {
  const fields = [];

  for (const field of customfields || []) {
    const type = String(field.fieldtype || "");
    const name = String(field.fieldname || "");

    let myvalue;
    if (type === "Phone") {
      myvalue = user.phone;
    } else if (type === "PhoneType") {
      myvalue = "Mobile";
    } else if (/dorm/i.test(name)) {
      myvalue = `${user.dormRoom}, ${user.classYear}`;
    } else if (field.required) {
      // Unknown required field: the sheet changed and the kiosk can't answer
      // it. Say so loudly instead of submitting something half-blank.
      return {
        error: `The sign-up sheet now requires "${name}", which this app doesn't ask for.`,
      };
    } else {
      myvalue = "";
    }

    fields.push({ ...field, myvalue });
  }

  return { fields };
}

function buildSignUpPayload({ urlid, data, slot, item, user, customFields }) {
  const phoneField = customFields.find((f) => f.fieldtype === "Phone");

  return {
    urlid,
    listid: data.id,
    owner: data.owner,
    title: data.header?.title || "",
    siid: [String(item.slotitemid)],
    rsvpid: 0,
    imid: 0,
    usealternatename: false,
    changemembermame: false,
    displayfirstname: user.firstName,
    displaylastname: user.lastName,
    firstname: user.firstName,
    lastname: user.lastName,
    email: user.email,
    savecontactinfo: false,
    type: "standard",
    source: "main",
    items: [
      {
        id: item.itemid,
        itemid: item.itemid,
        slotid: slot.slotid,
        slotitemid: item.slotitemid,
        listid: data.id,
        item: item.item,
        itemname: {},
        itemorder: item.itemorder,
        itemimage: "",
        itemcomment: item.itemcomment || "",
        comment: item.comment || "",
        location: slot.location || "",
        usetime: slot.usetime ?? 1,
        starttime: slot.starttime,
        endtime: slot.endtime,
        dtstarttime: parseSugTime(slot.starttime),
        dtendtime: parseSugTime(slot.endtime),
        qty: 1,
        myqty: 1,
        availableqty: 1,
        // The sheet's free-text comment column — "Pronouns" for us.
        mycomment: user.pronouns,
        mydonation: "",
        price: 0,
        discountprice: 0,
        discounttype: "",
        discountcriteria: "",
        discountlabel: "",
        discountisavailable: false,
        optionpricelist: "",
        optionnamelist: "",
        paymenttype: "none",
        paymentrequired: 0,
        paymentAmount: 0,
        paymentOptions: [],
        paymentOptionSelected: {},
        goalamount: 0,
        minimumamount: 0,
        displayraised: 0,
        donotshow: 0,
        priceError: false,
        commentError: false,
        slotError: false,
        qtyError: false,
      },
    ],
    member: {
      memberid: 0,
      parentid: 0,
      zoneid: 0,
      firstname: "",
      lastname: "",
      fullname: "",
      email: "",
      mobile: "",
      currency: "USD",
      productcode: "Basic",
      paymentprovider: "",
      ismemberpro: false,
      istrialuser: false,
      iseligiblefortrial: false,
      haspayments: false,
      hasmemberoptins: false,
      loggedin: false,
      membercontact: {
        address1: "",
        address2: "",
        city: "",
        state: "",
        zipcode: "",
        country: "",
        comnpanyname: "",
        phone: phoneField ? user.phone : "",
        phonetype: phoneField ? "Mobile" : "",
      },
    },
    isLoggedin: false,
    customFields,
    payLater: false,
  };
}

/**
 * Undo the sign-up we just made, and confirm it's actually gone — SignUpGenius
 * reports success on a delete whether or not anything was removed.
 */
async function rollBack(urlid, listid, slotitemid, ours) {
  const createdAt = Date.parse(ours.datecreated);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > ROLLBACK_WINDOW_MS) {
    // Not demonstrably the entry we just wrote — leave it alone.
    return false;
  }

  try {
    await deleteItemMember(urlid, listid, ours.itemmemberid);
    const remaining = await getSlotParticipants(urlid, listid, slotitemid);
    return !remaining.some((p) => p.itemmemberid === ours.itemmemberid);
  } catch (e) {
    console.error("rollback failed", e);
    return false;
  }
}

/**
 * Find the entry we just created. Matched on the name we submitted, taking the
 * most recent if someone with the same name is already on the slot.
 */
function findOurSignUp(participants, user) {
  const matches = participants.filter(
    (p) =>
      String(p.firstname || "").trim().toLowerCase() ===
        user.firstName.toLowerCase() &&
      String(p.lastname || "").trim().toLowerCase() ===
        user.lastName.toLowerCase()
  );

  return matches.sort(bySignUpOrder).pop();
}

/** Oldest sign-up first. */
function bySignUpOrder(a, b) {
  const at = Date.parse(a.datecreated);
  const bt = Date.parse(b.datecreated);
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
  // itemmemberid is an increasing key, so it breaks ties within the same second.
  return Number(a.itemmemberid) - Number(b.itemmemberid);
}

function fail(res, status, error) {
  return res.status(status).json({ data: "error", error });
}

module.exports = handleReserve;
