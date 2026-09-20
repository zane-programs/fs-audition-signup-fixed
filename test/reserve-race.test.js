// Drives reserve/[id].js with a stubbed SignUpGenius so the race paths can be
// exercised without touching the live sheet.
const path = require("path");
const ROOT = path.join(__dirname, "..");
const LIB = path.join(ROOT, "api/_lib/signupgenius.js");
const HANDLER = path.join(ROOT, "api/sug/[urlid]/reserve/[id].js");

const SLOT_ID = "835574457";
const SLOT_ITEM_ID = 1840127102;

const INFO = {
  DATA: {
    id: 65642443,
    owner: 139501932,
    header: { title: "Fleet Street Auditions 2026-2027" },
    signuplocked: false,
    expired: false,
    customfields: [
      { fieldtype: "Phone", fieldname: "Phone", required: true },
      { fieldtype: "PhoneType", fieldname: "PhoneType", required: true },
      { fieldtype: "Text", fieldname: "Dorm Room & School year", required: true },
    ],
    slots: {
      [SLOT_ID]: {
        slotid: Number(SLOT_ID),
        starttime: "September, 22 2026 22:48:00",
        endtime: "September, 22 2026 23:00:00",
        location: "Burbank Lecture Theater",
        usetime: 1,
        items: [{ itemid: 489035176, slotitemid: SLOT_ITEM_ID, item: "Audition", itemorder: 2, qty: 1, qtyTaken: "" }],
      },
    },
  },
};

const USER = {
  firstName: "Test", lastName: "Person", pronouns: "they/them",
  classYear: "Frosh", dormRoom: "Twain East 250",
  email: "test@stanford.edu", phone: "6505550123",
};

const person = (first, last, id, when) => ({
  firstname: first, lastname: last, itemmemberid: id,
  datecreated: when, slotitemid: SLOT_ITEM_ID, myqty: 1,
});

function load({ participantsBefore, participantsAfter, participantsAfterRollback,
                submitResponse = { SUCCESS: true }, deleteThrows = false }) {
  delete require.cache[require.resolve(HANDLER)];
  delete require.cache[require.resolve(LIB)];

  const lib = require(LIB);
  const calls = { submitted: 0 };

  calls.deleted = [];

  lib.getSignUpInfo = async () => JSON.parse(JSON.stringify(INFO));
  lib.sugApi = async () => { calls.submitted++; return submitResponse; };
  lib.deleteItemMember = async (_u, _l, id) => {
    if (deleteThrows) throw new Error("boom");
    calls.deleted.push(id);
    return true;
  };
  lib.getSlotParticipants = async () => {
    if (calls.submitted === 0) return participantsBefore;
    if (calls.deleted.length) return participantsAfterRollback ?? [];
    return participantsAfter;
  };

  return { handler: require(HANDLER), calls };
}

async function run(name, opts, expect) {
  const { handler, calls } = load(opts);
  const res = {
    statusCode: 200, body: undefined,
    setHeader() { return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  await handler({ method: "POST", query: { urlid: "x", id: SLOT_ID }, body: USER }, res);

  const okStatus = res.statusCode === expect.status;
  const okSubmit = calls.submitted === expect.submitted;
  const okMsg = !expect.match || String(res.body?.error || "").includes(expect.match);
  const okDel = expect.deleted === undefined ||
    JSON.stringify(calls.deleted) === JSON.stringify(expect.deleted);
  const pass = okStatus && okSubmit && okMsg && okDel;

  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}\n      -> ${res.statusCode} ${JSON.stringify(res.body)} (submits: ${calls.submitted}, deleted: ${JSON.stringify(calls.deleted)})`
  );
  if (!pass) process.exitCode = 1;
}

(async () => {
  const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  const OURS_LATE   = person("Test", "Person", 1400202600, iso(1000));
  const OURS_EARLY  = person("Test", "Person", 1400202580, iso(9000));
  const RIVAL_EARLY = person("Other", "Human", 1400202590, iso(5000));
  const RIVAL_LATE  = person("Other", "Human", 1400202610, iso(500));
  const OURS_STALE  = person("Test", "Person", 1400150000, iso(60 * 60 * 1000));

  await run("slot already full -> refuse, never submit",
    { participantsBefore: [RIVAL_EARLY], participantsAfter: [RIVAL_EARLY] },
    { status: 409, submitted: 0, match: "Someone just took" });

  await run("slot free -> submit, we hold it",
    { participantsBefore: [], participantsAfter: [OURS_LATE] },
    { status: 200, submitted: 1 });

  await run("raced and LOST -> roll our entry back, say so truthfully",
    { participantsBefore: [], participantsAfter: [RIVAL_EARLY, OURS_LATE],
      participantsAfterRollback: [RIVAL_EARLY] },
    { status: 409, submitted: 1, deleted: [OURS_LATE.itemmemberid],
      match: "you have not been signed up" });

  await run("raced, LOST, rollback did not take -> do NOT claim it was undone",
    { participantsBefore: [], participantsAfter: [RIVAL_EARLY, OURS_LATE],
      participantsAfterRollback: [RIVAL_EARLY, OURS_LATE] },
    { status: 409, submitted: 1, deleted: [OURS_LATE.itemmemberid],
      match: "let a Fleet Street member know" });

  await run("raced, LOST, delete errored -> do NOT claim it was undone",
    { participantsBefore: [], participantsAfter: [RIVAL_EARLY, OURS_LATE],
      deleteThrows: true },
    { status: 409, submitted: 1, deleted: [],
      match: "let a Fleet Street member know" });

  // Our new entry isn't visible in the read-back yet, and someone with the
  // same name has been on this slot for an hour. We must not delete them.
  const RIVAL_ANCIENT = person("Other", "Human", 1400100000, iso(2 * 60 * 60 * 1000));
  await run("name collision with an OLD entry -> never delete it",
    { participantsBefore: [], participantsAfter: [RIVAL_ANCIENT, OURS_STALE] },
    { status: 409, submitted: 1, deleted: [],
      match: "let a Fleet Street member know" });

  // The realistic collision: an old entry with our name, plus the one we just
  // made. Roll back ours, leave theirs alone.
  await run("name collision with a NEW entry -> delete only ours",
    { participantsBefore: [], participantsAfter: [OURS_STALE, RIVAL_EARLY, OURS_LATE],
      participantsAfterRollback: [OURS_STALE, RIVAL_EARLY] },
    { status: 409, submitted: 1, deleted: [OURS_LATE.itemmemberid],
      match: "you have not been signed up" });

  await run("raced and WON -> success",
    { participantsBefore: [], participantsAfter: [OURS_EARLY, RIVAL_LATE] },
    { status: 200, submitted: 1 });

  await run("SignUpGenius rejects submit -> surface its message",
    { participantsBefore: [], participantsAfter: [],
      submitResponse: { SUCCESS: false, MESSAGE: ["The email address is not valid."] } },
    { status: 400, submitted: 1, match: "email address is not valid" });
})();
