import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "./index.js";
import { createDatabase, ensureDemoMenus, seedDatabase } from "./db.js";

const secret = "aariva-test-secret-with-at-least-thirty-two-characters";
let mongo;
let db;
let server;
let baseUrl;
let databaseNumber = 0;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
}, { timeout: 180000 });

after(async () => {
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  db = await createDatabase({
    uri: mongo.getUri(),
    databaseName: `aariva_test_${++databaseNumber}`,
  });
  await seedDatabase(db);
  server = createApp(db, { authSecret: secret }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

afterEach(async () => {
  if (server) await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
  if (db) await db.close();
});

async function login(email = "student@aariva.demo", password = "Aariva123!") {
  return fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function auth(token) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

function futureDate(days = 3) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayInIndia() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function sundayFor(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function pastDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

test("signup creates a student account, then login returns a usable session", async () => {
  const details = {
    name: "  Jamie   Resident ",
    email: "JAMIE@EXAMPLE.COM",
    password: "simplepass",
    role: "mess_admin",
  };
  const signup = await fetch(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(details),
  });
  assert.equal(signup.status, 201);
  const { user, token } = await signup.json();
  assert.ok(token);
  assert.equal(user.name, "Jamie Resident");
  assert.equal(user.email, "jamie@example.com");
  assert.equal(user.role, "student");
  assert.equal("password_hash" in user, false);

  const session = await fetch(`${baseUrl}/auth/me`, { headers: auth(token) });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.id, user.id);

  const signIn = await login(details.email, details.password);
  assert.equal(signIn.status, 200);
  assert.equal((await signIn.json()).user.id, user.id);

  const duplicate = await fetch(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(details),
  });
  assert.equal(duplicate.status, 409);

  for (const invalid of [
    { ...details, email: "not-an-email" },
    { ...details, email: "other@example.com", password: "short7!" },
    { ...details, email: "other@example.com", name: " " },
  ]) {
    const response = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invalid),
    });
    assert.equal(response.status, 400);
  }
});

test("student can browse menus and make a reservation that appears in meals and bill", async () => {
  const loginResponse = await login();
  assert.equal(loginResponse.status, 200);
  const { token } = await loginResponse.json();

  const menuResponse = await fetch(`${baseUrl}/menus`, { headers: auth(token) });
  assert.equal(menuResponse.status, 200);
  const { menus } = await menuResponse.json();
  assert.equal(menus.length, 28);
  assert.ok(menus.every((menu) => menu.status === "published"));
  const menuDates = [...new Set(menus.map((menu) => menu.date))].sort();
  assert.deepEqual(menuDates, Array.from({ length: 7 }, (_, index) => addDays(sundayFor(todayInIndia()), index)));
  assert.equal(new Set(menus.map((menu) => menu.price_paise)).size, menus.length);
  assert.ok(menus.some((menu) => menu.title === "Rajma Chawal"));
  assert.ok(menus.some((menu) => menu.title === "Gujarati Thali"));
  await seedDatabase(db);
  assert.equal(await db.collection("menus").countDocuments({}), 28);

  const student = await db.collection("users").findOne({ email: "student@aariva.demo" });
  const menuId = randomUUID();
  const date = futureDate(8);
  await db.collection("menus").insertOne({
    id: menuId,
    mess_id: student.mess_id,
    title: "Test supper",
    date,
    meal_type: "dinner",
    description: "A test meal",
    price_paise: 777,
    booking_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "published",
  });

  const reservation = await fetch(`${baseUrl}/bookings`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ menuId }),
  });
  assert.equal(reservation.status, 201);
  const { booking } = await reservation.json();
  assert.equal(booking.status, "confirmed");

  const duplicate = await fetch(`${baseUrl}/bookings`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ menuId }),
  });
  assert.equal(duplicate.status, 409);

  const bookingsResponse = await fetch(`${baseUrl}/bookings`, { headers: auth(token) });
  const { bookings } = await bookingsResponse.json();
  assert.ok(bookings.some((item) => item.id === booking.id && item.title === "Test supper"));

  const receiptResponse = await fetch(`${baseUrl}/payments/demo`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ bookingIds: [booking.id] }),
  });
  assert.equal(receiptResponse.status, 200);
  const { payment } = await receiptResponse.json();
  assert.equal(payment.amountPaise, 777);
  assert.equal(payment.mealCount, 1);
  assert.equal(payment.realPayment, false);
  assert.match(payment.reference, /^DEMO-[A-F0-9]{10}$/);

  const cancel = await fetch(`${baseUrl}/bookings/${booking.id}/cancel`, {
    method: "PATCH",
    headers: auth(token),
    body: "{}",
  });
  assert.equal(cancel.status, 200);

  const canceledReceipt = await fetch(`${baseUrl}/payments/demo`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ bookingIds: [booking.id] }),
  });
  assert.equal(canceledReceipt.status, 400);
});

test("demo menus extend the rolling week without overwriting menus or reservations", async () => {
  await db.collection("menus").deleteMany({});
  const student = await db.collection("users").findOne({ email: "student@aariva.demo" });
  const startDate = sundayFor(futureDate(8));
  const nextWeek = addDays(startDate, 7);
  const followingDate = addDays(startDate, 1);

  await ensureDemoMenus(db, student.mess_id, startDate);
  assert.equal(await db.collection("menus").countDocuments({}), 28);
  const preservedMenu = await db.collection("menus").findOne({ date: followingDate, meal_type: "lunch" });
  const legacyDemoMenu = await db.collection("menus").findOne({ date: followingDate, meal_type: "breakfast" });
  await db.collection("menus").updateOne(
    { id: preservedMenu.id },
    { $set: { title: "Dining team update", price_paise: 9200 } },
  );
  await db.collection("menus").updateOne(
    { id: legacyDemoMenu.id },
    { $set: { price_paise: 5000 }, $unset: { demo_catalog: "" } },
  );
  await db.collection("bookings").insertOne({
    id: randomUUID(),
    menu_id: preservedMenu.id,
    user_id: student.id,
    mess_id: student.mess_id,
    status: "confirmed",
    price_paise: 9200,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await ensureDemoMenus(db, student.mess_id, startDate);
  await ensureDemoMenus(db, student.mess_id, nextWeek);
  assert.equal(await db.collection("menus").countDocuments({}), 56);
  const savedMenu = await db.collection("menus").findOne({ id: preservedMenu.id });
  assert.equal(savedMenu.title, "Dining team update");
  assert.equal(savedMenu.price_paise, 9200);
  const migratedMenu = await db.collection("menus").findOne({ id: legacyDemoMenu.id });
  assert.notEqual(migratedMenu.price_paise, 5000);
  assert.equal(migratedMenu.demo_catalog, true);
  assert.equal(await db.collection("bookings").countDocuments({ menu_id: preservedMenu.id }), 1);
});

test("feedback requires authentication and stores validated, user-scoped messages", async () => {
  assert.equal((await fetch(`${baseUrl}/feedback`)).status, 401);
  const { token } = await (await login()).json();
  const invalid = await fetch(`${baseUrl}/feedback`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ category: "other", message: "Too short" }),
  });
  assert.equal(invalid.status, 400);

  const submission = await fetch(`${baseUrl}/feedback`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ category: "error", message: "The menu page did not load." }),
  });
  assert.equal(submission.status, 201);
  const { feedback: saved } = await submission.json();
  assert.equal(saved.category, "error");
  assert.equal(saved.status, "received");

  const historyResponse = await fetch(`${baseUrl}/feedback`, { headers: auth(token) });
  assert.equal(historyResponse.status, 200);
  const { feedback } = await historyResponse.json();
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].id, saved.id);
});

test("only students can sign in and staff endpoints are no longer available", async () => {
  await db.collection("users").insertOne({
    id: randomUUID(),
    institution_id: "legacy-institution",
    mess_id: "legacy-mess",
    email: "admin@example.test",
    name: "Old Admin",
    role: "mess_admin",
    password_hash: await bcrypt.hash("validpassword", 10),
    active: true,
  });
  assert.equal((await login("admin@example.test", "validpassword")).status, 401);

  const studentResponse = await login();
  const { token } = await studentResponse.json();
  for (const route of ["/dashboard", "/inventory", "/complaints", "/analytics", "/wastage", "/leaves"]) {
    const response = await fetch(`${baseUrl}${route}`, { headers: auth(token) });
    assert.equal(response.status, 404, `${route} should not be an app feature`);
  }
});

test("cancellation deadline is enforced and logout revokes the token", async () => {
  const { token } = await (await login()).json();
  const student = await db.collection("users").findOne({ email: "student@aariva.demo" });
  const menuId = randomUUID();
  const date = futureDate(8);
  await db.collection("menus").insertOne({
    id: menuId,
    mess_id: student.mess_id,
    title: "Late booking meal",
    date,
    meal_type: "dinner",
    booking_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "published",
  });
  const reservationResponse = await fetch(`${baseUrl}/bookings`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ menuId }),
  });
  const { booking } = await reservationResponse.json();
  await db.collection("menus").updateOne(
    { id: menuId },
    { $set: { booking_deadline: new Date(Date.now() - 1000).toISOString() } },
  );
  const cancellation = await fetch(`${baseUrl}/bookings/${booking.id}/cancel`, {
    method: "PATCH",
    headers: auth(token),
    body: "{}",
  });
  assert.equal(cancellation.status, 409);

  const logout = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: auth(token),
    body: "{}",
  });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${baseUrl}/auth/me`, { headers: auth(token) })).status, 401);
});

test("meals from previous days cannot be newly reserved or cancelled", async () => {
  const { token } = await (await login()).json();
  const student = await db.collection("users").findOne({ email: "student@aariva.demo" });
  const menuId = randomUUID();
  const bookingId = randomUUID();
  const date = pastDate();
  await db.collection("menus").insertOne({
    id: menuId,
    mess_id: student.mess_id,
    title: "Yesterday's lunch",
    date,
    meal_type: "special",
    booking_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "published",
  });
  await db.collection("bookings").insertOne({
    id: bookingId,
    menu_id: menuId,
    user_id: student.id,
    mess_id: student.mess_id,
    status: "confirmed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const reserve = await fetch(`${baseUrl}/bookings`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ menuId }),
  });
  assert.equal(reserve.status, 409);

  const cancel = await fetch(`${baseUrl}/bookings/${bookingId}/cancel`, {
    method: "PATCH",
    headers: auth(token),
    body: "{}",
  });
  assert.equal(cancel.status, 409);

  const { bookings } = await (await fetch(`${baseUrl}/bookings`, { headers: auth(token) })).json();
  assert.ok(bookings.some((booking) => booking.id === bookingId && booking.date === date));
});
