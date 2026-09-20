const {
  sugApi,
  getSignUpInfo,
  sugMessage,
  parseSugTime,
} = require("../../../_lib/signupgenius");

// Fields the kiosk questionnaire collects. All are required by the sheet.
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
    if (item.qtyTaken) {
      return fail(res, 409, "Someone just took that slot. Please pick another.");
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

    // The availability we checked above comes from SignUpGenius' read endpoint,
    // which can lag a minute or so behind a fresh sign-up — so two people can
    // race onto the same slot and both be told it worked. Log the raw response
    // so a disputed slot can be untangled from the function logs afterwards.
    console.log(
      "reserved",
      JSON.stringify({ slotId, email: user.email, response })
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

function fail(res, status, error) {
  return res.status(status).json({ data: "error", error });
}

module.exports = handleReserve;
