const { sugApi, sugMessage } = require("../../_lib/signupgenius");

// Read-only actions the kiosk is allowed to proxy. Without this the endpoint
// would be an open relay for *any* SignUpGenius action, including ones that
// sign people up or mutate the sheet.
const ALLOWED_ACTIONS = new Set(["s.getSignUpInfo"]);

/** POST /api/sug/:urlid/:go — proxy a read of the sign-up sheet. */
async function handleSugAction(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const go = String(req.query.go || "");
  const urlid = String(req.query.urlid || "");

  if (!ALLOWED_ACTIONS.has(go)) {
    return res.status(403).json({ error: `Action "${go}" is not allowed` });
  }
  if (!urlid) {
    return res.status(400).json({ error: "Missing sign-up id" });
  }

  try {
    const response = await sugApi(go, { ...req.body, urlid });

    if (response?.SUCCESS === false) {
      return res
        .status(502)
        .json({ error: sugMessage(response) || "SignUpGenius rejected the request" });
    }

    // The sheet changes as people sign up, so never let this be cached.
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(response);
  } catch (e) {
    console.error("sug proxy failed", e);
    return res.status(502).json({ error: e?.message || "Could not reach SignUpGenius" });
  }
}

module.exports = handleSugAction;
