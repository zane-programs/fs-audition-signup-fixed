const { getSignUpInfo, slotCapacity } = require("../../_lib/signupgenius");

/**
 * GET|POST /api/sug/:urlid/availability
 *
 * Just the ids of slots that are no longer open, so the slot picker can poll
 * cheaply while someone is deciding and drop slots out from under them as
 * they fill. The full sheet is ~70KB; this is a few hundred bytes.
 *
 * This reflects the sheet's own `qtyTaken`, which lags a fresh sign-up — good
 * enough to keep the list honest, but the authoritative check is the per-slot
 * participant lookup that reserve/[id].js runs before it submits.
 */
async function handleAvailability(req, res) {
  const urlid = String(req.query.urlid || "");
  if (!urlid) {
    return res.status(400).json({ error: "Missing sign-up id" });
  }

  try {
    const { DATA } = await getSignUpInfo(urlid);

    const taken = Object.values(DATA.slots)
      .filter((slot) => {
        const item = slot.items?.[0];
        return !item || Number(item.qtyTaken || 0) >= slotCapacity(item);
      })
      .map((slot) => String(slot.slotid));

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      taken,
      closed: !!(DATA.signuplocked || DATA.expired),
    });
  } catch (e) {
    console.error("availability failed", e);
    return res
      .status(502)
      .json({ error: e?.message || "Could not reach SignUpGenius" });
  }
}

module.exports = handleAvailability;
