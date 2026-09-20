# Fleet Street Audition Sign-Up

A kiosk app for Fleet Street's audition tabling. Someone walks up to the laptop,
picks a slot, answers a handful of questions, and is signed up on the group's
[SignUpGenius](https://www.signupgenius.com/) sheet — without ever seeing
SignUpGenius' own UI. A second route drives the promo video on the TV next to
the table.

## Routes

| Route     | What it is                                                        |
| --------- | ----------------------------------------------------------------- |
| `/signup` | The kiosk flow: welcome → slot select → details → thanks.   |
| `/tv`     | Full-screen promo video for the TV. Double-click the welcome screen to go full screen; the TV page listens on a `BroadcastChannel` so the kiosk can flash the current person's name on screen. |

## Updating for a new year

Create the new sign-up on SignUpGenius, then set `URL_ID` in
[`src/utils/sug.ts`](src/utils/sug.ts) to the id from the sheet's URL:

```
https://www.signupgenius.com/go/10C0E44A9AF2AABFEC52-65642443-fleet
                                └──────────── URL_ID ────────────┘
```

That's the only value to change. Slot ids, item ids, times and the sheet's
custom-field ids are all read back from SignUpGenius at request time.

If the sheet gains a **new required custom field**, the kiosk can't invent an
answer for it — a sign-up will fail with a message naming the field. Add a
matching field to `STEPS` in
[`src/pages/SignUp/Details.tsx`](src/pages/SignUp/Details.tsx), add
the field to `REQUIRED_FIELDS`, and map it in `buildCustomFields` in
[`api/sug/[urlid]/reserve/[id].js`](api/sug/%5Burlid%5D/reserve/%5Bid%5D.js).

## How sign-ups actually happen

SignUpGenius has no public API, and the browser can't call their internal one
directly (CORS). So two serverless functions sit in between:

- **`POST /api/sug/:urlid/s.getSignUpInfo`** — proxies a read of the sheet.
  Only that one action is allowed through; otherwise the endpoint would be an
  open relay for any SignUpGenius action.
- **`POST /api/sug/:urlid/reserve/:slotId`** — reads the sheet, finds the slot,
  refuses it if it's already taken, builds the sign-up payload from live sheet
  metadata, and posts it to SignUpGenius' `s.processSignUpFormHandler`.

Both go through [`api/_lib/signupgenius.js`](api/_lib/signupgenius.js).

> Earlier versions drove a real headless browser (Puppeteer + stealth plugin)
> through the SignUpGenius form. That can't run in a serverless function and
> broke whenever SignUpGenius reshuffled their markup. The current version is
> two plain HTTP calls.

## Running it

```sh
npm install
npm run vercel:dev   # serves the app AND the /api functions on :3000
```

`npm start` runs the React dev server alone, which is fine for styling but
leaves `/api/*` returning 404, so slot loading and sign-up won't work. Use
`npm run vercel:dev` for anything that touches the sheet.

(The script is *not* called `dev`: Vercel's Create React App preset runs
`npm run dev` as its development command, so naming it that makes `vercel dev`
invoke itself.)

## Deploying

Pushing to `master` deploys to Vercel. [`vercel.json`](vercel.json) pins the
build and rewrites non-`/api` paths to `index.html` so client-side routes
survive a refresh.

To check a build the way Vercel will run it:

```sh
npx vercel build --prod
```
