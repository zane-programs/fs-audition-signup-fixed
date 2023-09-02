const fetch = require("node-fetch");

async function handleSugAction(req, res) {
  try {
    const request = await fetch(
      "https://www.signupgenius.com/SUGboxAPI.cfm?go=" +
        encodeURIComponent(req.query.go),
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.7",
          "content-type": "application/json, text/plain; charset=UTF-8",
          Referer: "https://www.signupgenius.com/",
        },
        body: JSON.stringify({ ...req.body, urlid: req.query.urlid }),
        method: "POST",
      }
    );

    const response = await request.json();

    res.status(200).send(response);
  } catch (e) {
    process.env.NODE_ENV && console.error(e);
    res.status(500).send(e?.message || e.toString());
  }
}

module.exports = handleSugAction;
