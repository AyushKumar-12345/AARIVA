import "dotenv/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { createDatabase, ensureDefaultTenant, ensureDemoMenus, publicDocument, seedDatabase } from "./db.js";

const MEAL_TYPES = ["breakfast", "lunch", "snacks", "dinner"];
const DEFAULT_MEAL_PRICE_PAISE = Number(process.env.DEFAULT_MEAL_PRICE_PAISE ?? 5000);
const MEAL_START_MINUTES = {
  breakfast: 7 * 60 + 30,
  lunch: 12 * 60 + 30,
  snacks: 16 * 60 + 30,
  dinner: 19 * 60 + 30,
};
const timestamp = () => new Date().toISOString();
const id = () => randomUUID();

function indiaDateAndMinutes(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function mealHasStarted(date, mealType) {
  const current = indiaDateAndMinutes();
  if (date < current.date) return true;
  if (date > current.date) return false;
  const start = MEAL_START_MINUTES[mealType];
  return start !== undefined && current.minutes >= start;
}

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(date, days) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function weekStart(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - parsed.getUTCDay());
  return parsed.toISOString().slice(0, 10);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: "student",
    institutionId: user.institution_id,
    messId: user.mess_id,
  };
}

export function createApp(db, {
  authSecret = process.env.AUTH_SECRET,
  clientOrigin = process.env.CLIENT_ORIGIN,
} = {}) {
  if (!authSecret || Buffer.byteLength(authSecret) < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  }
  if (!Number.isSafeInteger(DEFAULT_MEAL_PRICE_PAISE) || DEFAULT_MEAL_PRICE_PAISE < 0) {
    throw new Error("DEFAULT_MEAL_PRICE_PAISE must be a non-negative whole number of paise.");
  }

  const collection = (name) => db.collection(name);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
        connectSrc: ["'self'", "http://localhost:*", "http://127.0.0.1:*", "ws:", "wss:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }));
  app.use(cors({
    origin: clientOrigin ? clientOrigin.split(",").map((item) => item.trim()) : true,
    credentials: true,
  }));
  app.use(express.json({ limit: "32kb" }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 25,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
  });
  const signupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many account creation attempts. Try again in 15 minutes." },
  });
  const feedbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "You’ve sent several messages. Please try again in 15 minutes." },
  });

  const authenticate = asyncHandler(async (req, res, next) => {
    const header = req.get("authorization") || "";
    if (!header.startsWith("Bearer ")) return sendError(res, 401, "Please sign in to continue.");

    let payload;
    try {
      payload = jwt.verify(header.slice(7), authSecret, { issuer: "aariva" });
    } catch {
      return sendError(res, 401, "Your session is invalid or has expired.");
    }

    if (!payload.jti || await collection("revoked_tokens").findOne({ token_id: payload.jti })) {
      return sendError(res, 401, "Your session has been signed out.");
    }
    const user = await collection("users").findOne({
      id: payload.sub,
      role: "student",
      active: true,
    });
    if (!user) return sendError(res, 401, "Your account is unavailable. Please sign in again.");

    req.user = user;
    req.authPayload = payload;
    return next();
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "aariva" }));

  app.post("/api/auth/signup", signupLimiter, asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body?.password;

    if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
      return sendError(res, 400, "Enter a name between 2 and 80 characters.");
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return sendError(res, 400, "Enter a valid email address.");
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
      return sendError(res, 400, "Use a password between 8 and 128 characters.");
    }

    const messes = await collection("messes").find({}).limit(2).toArray();
    if (messes.length !== 1) {
      return sendError(res, 503, "Student signup is not available until one dining location is set up.");
    }
    const mess = messes[0];
    const institution = await collection("institutions").findOne({ id: mess.institution_id });
    if (!institution) return sendError(res, 503, "Student signup is temporarily unavailable.");

    const user = {
      id: id(),
      institution_id: institution.id,
      mess_id: mess.id,
      email,
      name,
      role: "student",
      password_hash: await bcrypt.hash(password, 12),
      active: true,
      created_at: timestamp(),
    };
    try {
      await collection("users").insertOne(user);
    } catch (error) {
      if (error?.code === 11000) return sendError(res, 409, "An account with this email already exists.");
      throw error;
    }

    const token = jwt.sign({ sub: user.id, jti: id() }, authSecret, {
      expiresIn: "12h",
      issuer: "aariva",
    });
    return res.status(201).json({ token, user: publicUser(user) });
  }));

  app.post("/api/auth/login", loginLimiter, asyncHandler(async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body?.password;
    if (!email || typeof password !== "string") return sendError(res, 400, "Email and password are required.");

    const user = await collection("users").findOne({ email, role: "student", active: true });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return sendError(res, 401, "Email or password is incorrect.");
    }
    const token = jwt.sign({ sub: user.id, jti: id() }, authSecret, {
      expiresIn: "12h",
      issuer: "aariva",
    });
    return res.json({ token, user: publicUser(user) });
  }));

  app.get("/api/auth/me", authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

  app.post("/api/auth/logout", authenticate, asyncHandler(async (req, res) => {
    await collection("revoked_tokens").updateOne(
      { token_id: req.authPayload.jti },
      { $setOnInsert: { token_id: req.authPayload.jti, expires_at: new Date(req.authPayload.exp * 1000) } },
      { upsert: true },
    );
    return res.json({ success: true });
  }));

  app.get("/api/feedback", authenticate, asyncHandler(async (req, res) => {
    const feedback = await collection("feedback_entries")
      .find({ user_id: req.user.id, mess_id: req.user.mess_id })
      .sort({ created_at: -1 })
      .limit(20)
      .toArray();
    return res.json({ feedback: feedback.map(publicDocument) });
  }));

  app.post("/api/feedback", authenticate, feedbackLimiter, asyncHandler(async (req, res) => {
    const category = req.body?.category;
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!["error", "suggestion"].includes(category)) {
      return sendError(res, 400, "Choose an error report or suggestion.");
    }
    if (message.length < 10 || message.length > 2000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) {
      return sendError(res, 400, "Write between 10 and 2,000 characters.");
    }
    const entry = {
      id: id(),
      user_id: req.user.id,
      mess_id: req.user.mess_id,
      category,
      message,
      status: "received",
      created_at: timestamp(),
    };
    await collection("feedback_entries").insertOne(entry);
    return res.status(201).json({ feedback: publicDocument(entry) });
  }));

  app.get("/api/menus", authenticate, asyncHandler(async (req, res) => {
    const today = indiaDateAndMinutes().date;
    const requestedWeekStart = req.query.weekStart && validDate(req.query.weekStart)
      ? weekStart(req.query.weekStart)
      : weekStart(today);

    if (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO_DATA !== "false") {
      await ensureDemoMenus(db, req.user.mess_id, requestedWeekStart);
    }
    const currentWeekStart = requestedWeekStart;
    const nextWeekStart = addDays(currentWeekStart, 7);
    const filter = {
      mess_id: req.user.mess_id,
      status: "published",
      date: { $gte: currentWeekStart, $lt: nextWeekStart },
    };
    if (req.query.date) {
      if (!validDate(req.query.date)) return sendError(res, 400, "Choose a valid menu date.");
      if (req.query.date < currentWeekStart || req.query.date >= nextWeekStart) {
        return sendError(res, 400, "Choose a date in this Sunday-to-Saturday menu week.");
      }
      filter.date = req.query.date;
    }
    const menus = await collection("menus").find(filter).sort({ date: 1 }).limit(100).toArray();
    const bookings = await collection("bookings").find({
      user_id: req.user.id,
      menu_id: { $in: menus.map((menu) => menu.id) },
    }).toArray();
    const bookingStatus = new Map(bookings.map((booking) => [booking.menu_id, booking.status]));
    const mealOrder = new Map(MEAL_TYPES.map((meal, index) => [meal, index]));
    menus.sort((a, b) => a.date.localeCompare(b.date) ||
      mealOrder.get(a.meal_type) - mealOrder.get(b.meal_type));

    const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayNamesFull = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(currentWeekStart, index);
      const parsed = new Date(`${date}T12:00:00.000Z`);
      const dayOfWeek = parsed.getUTCDay();
      const dayNum = parsed.getUTCDate();
      const monthShort = monthNamesShort[parsed.getUTCMonth()];
      const isToday = date === today;
      const isTomorrow = date === addDays(today, 1);
      const isPast = date < today;
      return {
        date,
        dayOfWeek,
        dayShort: dayNamesShort[dayOfWeek],
        dayName: dayNamesFull[dayOfWeek],
        dayNumber: dayNum,
        monthShort,
        isToday,
        isTomorrow,
        isPast,
        label: isToday ? "Today" : isTomorrow ? "Tomorrow" : `${dayNum} ${monthShort}`,
      };
    });

    return res.json({
      today,
      weekStart: currentWeekStart,
      weekEnd: addDays(currentWeekStart, 6),
      prevWeekStart: addDays(currentWeekStart, -7),
      nextWeekStart: addDays(currentWeekStart, 7),
      isCurrentWeek: currentWeekStart === weekStart(today),
      days,
      menus: menus.map((menu) => ({
        ...publicDocument(menu),
        price_paise: menu.price_paise ?? DEFAULT_MEAL_PRICE_PAISE,
        myBooking: bookingStatus.get(menu.id) || null,
      })),
    });
  }));

  app.get("/api/bookings", authenticate, asyncHandler(async (req, res) => {
    const bookings = await collection("bookings")
      .find({ user_id: req.user.id, mess_id: req.user.mess_id })
      .sort({ created_at: -1 })
      .limit(100)
      .toArray();
    const menus = await collection("menus").find({
      id: { $in: [...new Set(bookings.map((booking) => booking.menu_id))] },
      mess_id: req.user.mess_id,
    }).toArray();
    const menuById = new Map(menus.map((menu) => [menu.id, menu]));
    const result = bookings.flatMap((booking) => {
      const menu = menuById.get(booking.menu_id);
      if (!menu) return [];
      return [{
        ...publicDocument(booking),
        title: menu.title,
        date: menu.date,
        meal_type: menu.meal_type,
        booking_deadline: menu.booking_deadline,
        price_paise: booking.price_paise ?? menu.price_paise ?? DEFAULT_MEAL_PRICE_PAISE,
      }];
    });
    return res.json({ bookings: result });
  }));

  app.post("/api/bookings", authenticate, asyncHandler(async (req, res) => {
    const menuId = req.body?.menuId;
    if (typeof menuId !== "string" || !menuId) return sendError(res, 400, "Choose a meal to reserve.");
    const menu = await collection("menus").findOne({
      id: menuId,
      mess_id: req.user.mess_id,
      status: "published",
    });
    if (!menu) return sendError(res, 404, "This meal is not available.");
    if (!validDate(menu.date) || menu.date < indiaDateAndMinutes().date) {
      return sendError(res, 409, "This meal date has passed.");
    }
    if (mealHasStarted(menu.date, menu.meal_type)) {
      return sendError(res, 409, "This meal has already started and can no longer be reserved.");
    }
    if (!Number.isFinite(Date.parse(menu.booking_deadline)) || Date.now() >= Date.parse(menu.booking_deadline)) {
      return sendError(res, 409, "The booking deadline for this meal has passed.");
    }

    const bookings = collection("bookings");
    const existing = await bookings.findOne({ user_id: req.user.id, menu_id: menuId });
    if (existing?.status === "confirmed" || existing?.status === "attended") {
      return sendError(res, 409, "You already reserved this meal.");
    }
    if (existing?.status === "cancelled") {
      const rebooked = await bookings.findOneAndUpdate(
        { id: existing.id, status: "cancelled" },
        { $set: {
          status: "confirmed",
          price_paise: menu.price_paise ?? DEFAULT_MEAL_PRICE_PAISE,
          updated_at: timestamp(),
        } },
        { returnDocument: "after" },
      );
      if (rebooked) return res.json({ booking: publicDocument(rebooked) });
      return sendError(res, 409, "You already reserved this meal.");
    }

    const booking = {
      id: id(),
      menu_id: menuId,
      user_id: req.user.id,
      mess_id: req.user.mess_id,
      status: "confirmed",
      price_paise: menu.price_paise ?? DEFAULT_MEAL_PRICE_PAISE,
      created_at: timestamp(),
      updated_at: timestamp(),
    };
    try {
      await bookings.insertOne(booking);
      return res.status(201).json({ booking: publicDocument(booking) });
    } catch (error) {
      if (error?.code === 11000) return sendError(res, 409, "You already reserved this meal.");
      throw error;
    }
  }));

  app.patch("/api/bookings/:id/cancel", authenticate, asyncHandler(async (req, res) => {
    const booking = await collection("bookings").findOne({
      id: req.params.id,
      user_id: req.user.id,
      mess_id: req.user.mess_id,
      status: "confirmed",
    });
    if (!booking) return sendError(res, 404, "Active reservation not found.");
    const menu = await collection("menus").findOne({ id: booking.menu_id, mess_id: req.user.mess_id });
    if (!menu) return sendError(res, 404, "Reservation menu not found.");
    if (mealHasStarted(menu.date, menu.meal_type)) {
      return sendError(res, 409, "This meal has already started and can no longer be cancelled.");
    }
    if (!Number.isFinite(Date.parse(menu.booking_deadline)) || Date.now() >= Date.parse(menu.booking_deadline)) {
      return sendError(res, 409, "The cancellation deadline for this meal has passed.");
    }
    const result = await collection("bookings").updateOne(
      { id: booking.id, user_id: req.user.id, status: "confirmed" },
      { $set: { status: "cancelled", updated_at: timestamp() } },
    );
    if (!result.modifiedCount) return sendError(res, 409, "This reservation can no longer be cancelled.");
    return res.json({ success: true });
  }));

  app.post("/api/payments/demo", authenticate, asyncHandler(async (req, res) => {
    const bookingIds = req.body?.bookingIds;
    if (!Array.isArray(bookingIds) || bookingIds.length < 1 || bookingIds.length > 100 ||
        bookingIds.some((bookingId) => typeof bookingId !== "string" || !bookingId) ||
        new Set(bookingIds).size !== bookingIds.length) {
      return sendError(res, 400, "Choose between 1 and 100 different reserved meals.");
    }
    const bookings = await collection("bookings").find({
      id: { $in: bookingIds },
      user_id: req.user.id,
      mess_id: req.user.mess_id,
      status: "confirmed",
    }).toArray();
    const menus = await collection("menus").find({
      id: { $in: bookings.map((booking) => booking.menu_id) },
      mess_id: req.user.mess_id,
      date: { $gte: indiaDateAndMinutes().date },
    }).toArray();
    if (bookings.length !== bookingIds.length || menus.length !== bookingIds.length ||
        menus.some((menu) => mealHasStarted(menu.date, menu.meal_type))) {
      return sendError(res, 400, "Only your active, upcoming reservations can be included.");
    }
    const menuById = new Map(menus.map((menu) => [menu.id, menu]));
    return res.json({
      payment: {
        status: "simulated",
        amountPaise: bookings.reduce((total, booking) => {
          const menu = menuById.get(booking.menu_id);
          return total + (booking.price_paise ?? menu.price_paise ?? DEFAULT_MEAL_PRICE_PAISE);
        }, 0),
        mealCount: bookings.length,
        currency: "INR",
        reference: `DEMO-${id().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
        realPayment: false,
      },
    });
  }));

  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(here, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return sendError(res, 404, "API route not found.");
    return res.sendFile(path.join(dist, "index.html"), (error) => error && next(error));
  });
  app.use((error, _req, res, _next) => {
    console.error("AARIVA request failed:", error.message);
    return sendError(res, 500, "Something went wrong. Please try again.");
  });
  return app;
}

async function start() {
  const isProd = process.env.NODE_ENV === "production";
  const authSecret = process.env.AUTH_SECRET ||
    (isProd ? null : "aariva-development-auth-secret-key-min-32-chars-long");
  if (!authSecret || Buffer.byteLength(authSecret) < 32) {
    throw new Error("Set AUTH_SECRET to a random secret of at least 32 characters before startup.");
  }

  const db = await createDatabase();
  try {
    await ensureDefaultTenant(db);
    if (!isProd && process.env.SEED_DEMO_DATA !== "false") await seedDatabase(db);

    const app = createApp(db, { authSecret });
    const port = Number(process.env.PORT || 4001);
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`[AARIVA] API server listening on http://localhost:${port} (and 127.0.0.1:${port})`);
    });
    const shutdown = () => server.close(async () => {
      await db.close();
      process.exit(0);
    });
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    await db.close();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  start().catch((error) => {
    console.error("Unable to start AARIVA:", error.message);
    process.exitCode = 1;
  });
}
