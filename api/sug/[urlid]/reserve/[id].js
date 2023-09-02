const { default: puppeteer } = require("puppeteer-extra");
const { DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } = require("puppeteer");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

// Add adblocker plugin, which will transparently block ads in all pages you
// create using puppeteer.
const AdblockerPlugin = require("puppeteer-extra-plugin-adblocker");
puppeteer.use(
  AdblockerPlugin({
    // Optionally enable Cooperative Mode for several request interceptors
    interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
  })
);

async function handleReserve(req, res) {
  // escape ids
  const slotId = encodeURIComponent(req.query.id);
  const urlId = encodeURIComponent(req.query.urlid);

  // enforce presence of form fields
  const { firstName, lastName, pronouns, classYear, dormRoom, email } =
    req.body;
  if (
    !firstName ||
    !lastName ||
    !pronouns ||
    !classYear ||
    !dormRoom ||
    !email
  ) {
    return res.status(400).send({ data: "error", error: "missing form field" });
  }

  const browser = await puppeteer.launch({ headless: true });
  // const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  console.log("opened browser page");

  // go to signup page based on urlid
  await page.goto(`https://www.signupgenius.com/go/${urlId}#/`);
  console.log("went to signup page");

  // find element for time slot
  const timeWrapSelector = await page.evaluate(
    (slotId) => "#" + CSS.escape(slotId + "-time-wrap"),
    slotId
  );
  console.log("timeWrapSelector", timeWrapSelector);

  // wait for time wrap selector
  await page.waitForSelector(timeWrapSelector, { visible: true });

  // click button for this time slot
  await page.evaluate((timeWrapSelector) => {
    document
      .querySelector(timeWrapSelector)
      .nextElementSibling.querySelector("signup-button")
      .classList.add("fs-signup-button");
  }, timeWrapSelector);

  await page.waitForSelector(".fs-signup-button button", { visible: true });

  const isFull = await page.evaluate(() => {
    return document
      .querySelector(".fs-signup-button button")
      .classList.contains("full");
  });

  if (isFull) {
    return res.status(400).send({ data: "error", error: "slot is full" });
  }

  await page.click(".fs-signup-button button");
  console.log("clicked signup button");

  // select time slot with .btn-signup-submit
  await page.waitForSelector(".btn-signup-submit", { visible: true });
  await page.click(".btn-signup-submit");
  console.log("clicked signup submit button");

  // wait for final signup button
  await page.waitForSelector(`[name="btnSignUp"]`, { visible: true });

  // TEXT FIELDS:
  // Pronouns
  await fillTextInput(page, `[aria-label="Pronouns"]`, pronouns);
  // First Name
  await fillTextInput(page, "#firstname", firstName);
  // Last Name
  await fillTextInput(page, "#lastname", lastName);
  // Email
  await fillTextInput(page, "#email", email);
  // Dorm Room & School year
  await fillTextInput(
    page,
    `[data-ng-if="customFields.length"] input`,
    dormRoom + ", " + classYear
  );

  // click final signup button
  await page.evaluate(() =>
    document.querySelector(`[name="btnSignUp"]`).click()
  );

  // finalize sign up, waiting for thanks
  await page.waitForSelector(".thank-you-wrapper", { visible: true });

  // close browser
  await browser.close();

  res.status(200).send({ data: "success" });
}

async function fillTextInput(page, selector, text) {
  await page.waitForSelector(selector, { visible: true });
  await page.focus(selector);
  await page.keyboard.type(text);
  console.log(`filled text input ${selector} with text: ${text}`);
}

module.exports = handleReserve;
