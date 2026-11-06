# AARIVA

A simple student dining app: browse meals, reserve or cancel a meal, and see the cost of upcoming reservations.

## Run locally

Requirements: Node.js 20+ and npm.

```powershell
npm install
npm run dev
```

Open the client URL printed by Vite (usually `http://localhost:5173`). The API runs on port `4001`. If a port is already in use, stop the other AARIVA process or use the alternate URL printed by Vite.

When no MongoDB URL is configured, development uses an in-memory MongoDB and seeds sample meals and a demo student:

- Email: `student@aariva.demo`
- Password: `Aariva123!`

The sample account is only for local development. New users can also create student accounts from the sign-up screen. Demo menus fill the current calendar week (Sunday through Saturday) using the live `Asia/Kolkata` date; production menus remain controlled by the database.

## What the app does

- **Home** shows your next reservation and bill total.
- **Menu** shows the current Sunday-to-Saturday calendar week, with dates that advance in the `Asia/Kolkata` timezone and different sample prices for every meal. On Sunday, the date strip switches to the new week.
- **My meals** separates upcoming, past, and cancelled reservations. You can cancel before a meal starts and rebook eligible cancellations.
- **Bill** shows an itemized total using each menu's configured price. The printable bill is a demo preview; no payment is processed.
- **Feedback** lets signed-in students report a problem or send a suggestion and see their recent messages.
- **Sign in and sign up** include a three-image carousel with manual controls.
- **Account** shows your student details and lets you sign out.

This simplified version supports one dining location and student accounts only. It has no staff pages, menu editor, or real payment processing. A production database needs a dining location and published menus configured before students can use the meal features. Set `price_paise` on published menu records to control their prices; `DEFAULT_MEAL_PRICE_PAISE` is used when a menu has no price configured.

## Configuration

Copy `.env.example` to `.env` if you want to configure the server. For MongoDB Atlas or a local MongoDB server, set:

```env
MONGODB_URI=your-mongodb-connection-string
MONGODB_DB=aariva
AUTH_SECRET=replace-with-a-random-secret-of-at-least-32-characters
DEFAULT_MEAL_PRICE_PAISE=5000
```

Leave `MONGODB_URI` empty for the local in-memory database. Do not use the example auth secret in production.

## Checks

```powershell
npm test
npm run build
npm run check
```

## Project structure

```text
AARIVA/
├── server/
│   ├── db.js                 # MongoDB connection, indexes, and local demo data
│   ├── index.js              # Student auth, menus, reservations, and demo receipts
│   └── integration.test.js   # API integration tests
├── src/
│   ├── StudentApp.jsx        # Student pages and flows
│   ├── api.js                # Frontend API client
│   ├── branding.js           # App name and tagline
│   ├── main.jsx              # Application bootstrap
│   └── styles.css            # Responsive UI styles
├── .env.example              # Optional server configuration
├── package.json              # Scripts and dependencies
└── vite.config.js            # Development client and API proxy
```
