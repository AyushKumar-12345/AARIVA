import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";

const now = () => new Date().toISOString();
const newId = () => randomUUID();
const DEFAULT_MEAL_PRICE_PAISE = Number(process.env.DEFAULT_MEAL_PRICE_PAISE ?? 5000);
const DEMO_MEAL_PRICES_PAISE = {
  breakfast: [3000, 3200, 3400, 3600, 3800, 4000, 4200],
  lunch: [5500, 5700, 5900, 6100, 6300, 6500, 6700],
  snacks: [1600, 1800, 2000, 2200, 2400, 2600, 2800],
  dinner: [7000, 7200, 7400, 7600, 7800, 8000, 8200],
};
const DEMO_WEEKLY_MEALS = [
  [
    ["breakfast", "Idli, Sambar & Chutney", "Steamed idli with warm sambar and coconut chutney", "Coconut"],
    ["lunch", "Rice, Dal & Vegetables", "Steamed rice, dal, seasonal vegetables and salad", "Dairy"],
    ["snacks", "Tea & Vegetable Cutlet", "Masala tea with a crisp vegetable cutlet", "Gluten"],
    ["dinner", "Roti, Paneer & Rice", "Whole-wheat roti, paneer curry and jeera rice", "Dairy, Gluten"],
  ],
  [
    ["breakfast", "Poha & Fresh Fruit", "Light poha with peanuts, lemon and fresh fruit", "Peanuts"],
    ["lunch", "Rajma Chawal", "Slow-cooked rajma, steamed rice and cucumber salad", "None"],
    ["snacks", "Masala Chai & Dhokla", "Masala chai with soft steamed dhokla", "Mustard"],
    ["dinner", "Aloo Gobi & Roti", "Aloo gobi, whole-wheat roti and dal", "Gluten"],
  ],
  [
    ["breakfast", "Masala Dosa", "Crisp dosa with potato masala and sambar", "Coconut"],
    ["lunch", "Chole, Rice & Roti", "Chickpea curry with rice, roti and onion salad", "Gluten"],
    ["snacks", "Lemon Tea & Samosa", "Fresh lemon tea with a potato samosa", "Gluten"],
    ["dinner", "Vegetable Pulao & Raita", "Fragrant vegetable pulao with cooling raita", "Dairy"],
  ],
  [
    ["breakfast", "Upma & Coconut Chutney", "Vegetable upma with coconut chutney", "Coconut"],
    ["lunch", "Kadhi Pakora & Rice", "Punjabi kadhi with pakora, rice and salad", "Dairy, Gluten"],
    ["snacks", "Filter Coffee & Sundal", "South Indian filter coffee with chickpea sundal", "None"],
    ["dinner", "Dal Makhani & Roti", "Slow-cooked dal makhani, roti and rice", "Dairy, Gluten"],
  ],
  [
    ["breakfast", "Aloo Paratha & Curd", "Stuffed aloo paratha with fresh curd and pickle", "Dairy, Gluten"],
    ["lunch", "Sambar Rice & Poriyal", "Sambar rice with seasonal vegetable poriyal", "None"],
    ["snacks", "Ginger Tea & Bhel", "Ginger tea with tangy puffed-rice bhel", "Peanuts"],
    ["dinner", "Matar Paneer & Roti", "Matar paneer, roti and cumin rice", "Dairy, Gluten"],
  ],
  [
    ["breakfast", "Besan Chilla", "Savory gram-flour pancakes with mint chutney", "None"],
    ["lunch", "Vegetable Biryani & Raita", "Layered vegetable biryani with cucumber raita", "Dairy"],
    ["snacks", "Cold Coffee & Sandwich", "Chilled coffee with a grilled vegetable sandwich", "Dairy, Gluten"],
    ["dinner", "Pav Bhaji", "Mumbai-style vegetable bhaji with toasted pav", "Dairy, Gluten"],
  ],
  [
    ["breakfast", "Puri Bhaji", "Fluffy puri with potato bhaji and pickle", "Gluten"],
    ["lunch", "Gujarati Thali", "Dal, rice, roti, seasonal shaak and salad", "Gluten"],
    ["snacks", "Chaas & Khandvi", "Chilled spiced buttermilk with soft khandvi", "Dairy, Mustard"],
    ["dinner", "Vegetable Khichdi", "Comforting moong dal khichdi with kadhi", "Dairy"],
  ],
];

function indiaDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function ensureDemoMenus(db, messId, startDate = new Date()) {
  const requestedDate = typeof startDate === "string" ? startDate : indiaDate(startDate);
  const requestedDay = new Date(`${requestedDate}T00:00:00.000Z`);
  requestedDay.setUTCDate(requestedDay.getUTCDate() - requestedDay.getUTCDay());
  const start = requestedDay;
  const createdAt = now();
  const operations = [];

  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    const dateString = date.toISOString().slice(0, 10);
    const meals = DEMO_WEEKLY_MEALS[date.getUTCDay()];

    for (const [meal_type, title, description, allergens] of meals) {
      const price_paise = DEMO_MEAL_PRICES_PAISE[meal_type][date.getUTCDay()];
      operations.push({
        updateOne: {
          filter: { mess_id: messId, date: dateString, meal_type },
          update: {
            $setOnInsert: {
              id: newId(),
              mess_id: messId,
              title,
              date: dateString,
              meal_type,
              description,
              allergens,
              vegetarian: true,
              price_paise,
              demo_catalog: true,
              booking_deadline: `${dateString}T23:59:00+05:30`,
              status: "published",
              created_at: createdAt,
            },
          },
          upsert: true,
        },
      });
      operations.push({
        updateOne: {
          filter: {
            mess_id: messId,
            date: dateString,
            meal_type,
            title,
            price_paise: DEFAULT_MEAL_PRICE_PAISE,
            demo_catalog: { $ne: true },
          },
          update: { $set: { price_paise, demo_catalog: true } },
        },
      });
    }
  }

  if (operations.length) {
    try {
      await db.collection("menus").bulkWrite(operations, { ordered: false });
    } catch (error) {
      const writeErrors = error.writeErrors || [];
      const duplicateRace = error.code === 11000 ||
        (writeErrors.length > 0 && writeErrors.every((writeError) => writeError.code === 11000));
      if (!duplicateRace) throw error;
      await db.collection("menus").bulkWrite(operations, { ordered: false });
    }
  }
}

export async function createDatabase({
  uri = process.env.MONGODB_URI,
  databaseName = process.env.MONGODB_DB || "aariva",
} = {}) {
  const isProd = process.env.NODE_ENV === "production";
  const useMemoryDatabase = !uri || uri.includes("YOUR_CLUSTER") || uri.includes("YOUR_DB_USER");
  let mongoServer = null;

  if (useMemoryDatabase) {
    if (isProd) throw new Error("Set MONGODB_URI to your MongoDB connection string.");
    console.log("[AARIVA] Starting the local in-memory database...");
    const { MongoMemoryReplSet } = await import("mongodb-memory-server");
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = mongoServer.getUri();
  }
  if (!databaseName.trim()) throw new Error("MONGODB_DB must be a database name.");

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: isProd ? 10000 : 3500 });
  try {
    await client.connect();
    const database = client.db(databaseName);
    const db = {
      client,
      database,
      collection: (name) => database.collection(name),
      close: async () => {
        await client.close();
        if (mongoServer) await mongoServer.stop();
      },
    };
    await Promise.all([
      db.collection("users").createIndex({ email: 1 }, { unique: true }),
      db.collection("menus").createIndex({ mess_id: 1, date: 1, meal_type: 1 }, { unique: true }),
      db.collection("bookings").createIndex({ user_id: 1, menu_id: 1 }, { unique: true }),
      db.collection("bookings").createIndex({ mess_id: 1, status: 1 }),
      db.collection("feedback_entries").createIndex({ user_id: 1, created_at: -1 }),
      db.collection("revoked_tokens").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    ]);
    return db;
  } catch (error) {
    await client.close().catch(() => {});
    if (mongoServer) await mongoServer.stop().catch(() => {});
    throw error;
  }
}

export function publicDocument(document) {
  if (!document) return null;
  const { _id, ...result } = document;
  return { id: result.id || _id?.toString(), ...result };
}

export async function ensureDefaultTenant(db, {
  messName = process.env.DEFAULT_MESS_NAME || "The Garden Table",
  institutionName = process.env.DEFAULT_INSTITUTION_NAME || "AARIVA House",
} = {}) {
  const messes = await db.collection("messes").find({}).limit(2).toArray();
  if (messes.length > 1) {
    throw new Error("The student app supports one dining location. Keep only one mess in the database.");
  }
  if (messes.length === 1) {
    const institution = await db.collection("institutions").findOne({ id: messes[0].institution_id });
    if (!institution) throw new Error("The dining location has no matching institution.");
    return { institution, mess: messes[0] };
  }

  const institution = { id: newId(), name: institutionName, created_at: now() };
  const mess = {
    id: newId(),
    institution_id: institution.id,
    name: messName,
    created_at: now(),
  };
  await db.collection("institutions").insertOne(institution);
  await db.collection("messes").insertOne(mess);
  return { institution, mess };
}

export async function seedDatabase(db) {
  const { institution, mess } = await ensureDefaultTenant(db);
  const createdAt = now();
  let student = await db.collection("users").findOne({ email: "student@aariva.demo" });
  if (!student && await db.collection("users").countDocuments() === 0) {
    student = {
      id: newId(),
      institution_id: institution.id,
      mess_id: mess.id,
      email: "student@aariva.demo",
      name: "Aariva Resident",
      role: "student",
      password_hash: await bcrypt.hash("Aariva123!", 10),
      active: true,
      created_at: createdAt,
    };
    await db.collection("users").insertOne(student);
  }

  await ensureDemoMenus(db, mess.id);
  const currentDate = indiaDate();
  const currentDay = new Date(`${currentDate}T00:00:00.000Z`);
  const tomorrowDate = new Date(currentDay);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrowString = tomorrowDate.toISOString().slice(0, 10);
  if (currentDay.getUTCDay() === 6) {
    await ensureDemoMenus(db, mess.id, tomorrowString);
  }
  currentDay.setUTCDate(currentDay.getUTCDate() - currentDay.getUTCDay());
  const start = currentDay;
  const dates = Array.from({ length: 7 }, (_, day) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + day);
    return date.toISOString().slice(0, 10);
  });
  const menuCollection = db.collection("menus");
  if (!student) return true;
  const tomorrowBreakfast = await menuCollection.findOne({
    mess_id: mess.id,
    date: tomorrowString,
    meal_type: "breakfast",
  });
  const tomorrowLunch = await menuCollection.findOne({
    mess_id: mess.id,
    date: tomorrowString,
    meal_type: "lunch",
  });
  for (const menu of [tomorrowBreakfast, tomorrowLunch]) {
    if (!menu) continue;
    await db.collection("bookings").updateOne(
      { user_id: student.id, menu_id: menu.id },
      {
        $setOnInsert: {
          id: newId(),
          menu_id: menu.id,
          user_id: student.id,
          mess_id: mess.id,
          status: "confirmed",
          price_paise: menu.price_paise ?? DEFAULT_MEAL_PRICE_PAISE,
          created_at: createdAt,
          updated_at: createdAt,
        },
      },
      { upsert: true },
    );
  }
  return true;
}
