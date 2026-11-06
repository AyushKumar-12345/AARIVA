import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, Coffee,
  CreditCard, Home, LogOut, MessageSquareText, Printer, UtensilsCrossed, UserRound, X,
} from "lucide-react";
import { api } from "./api.js";
import { BRAND } from "./branding.js";

const MEALS = ["breakfast", "lunch", "snacks", "dinner"];
const MEAL_NAMES = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snacks: "Snacks",
  dinner: "Dinner",
};
const MEAL_TIMES = {
  breakfast: "7:30–10:00 am",
  lunch: "12:30–3:00 pm",
  snacks: "4:30–6:00 pm",
  dinner: "7:30–10:00 pm",
};
const MEAL_STARTS = {
  breakfast: "07:30",
  lunch: "12:30",
  snacks: "16:30",
  dinner: "19:30",
};
const MEAL_ENDS = {
  breakfast: "10:00",
  lunch: "15:00",
  snacks: "18:00",
  dinner: "22:00",
};
const MEAL_IMAGES = {
  breakfast: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=900&q=85",
  lunch: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=900&q=85",
  snacks: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=85",
  dinner: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=900&q=85",
};
const PAGES = [
  { id: "home", label: "Home", icon: Home },
  { id: "menu", label: "Menu", icon: UtensilsCrossed },
  { id: "meals", label: "My meals", icon: CalendarDays },
  { id: "bill", label: "Bill", icon: CreditCard },
  { id: "feedback", label: "Feedback", icon: MessageSquareText },
];

const todayIso = (value = Date.now()) => {
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
};
const addCalendarDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const formatDate = (date, refToday = todayIso()) => {
  if (!date) return "";
  if (date === refToday) return "Today";
  if (date === addCalendarDays(refToday, 1)) return "Tomorrow";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
};
const formatWeekRange = (start, end) => {
  if (!start || !end) return "Weekly Menu";
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  const startStr = startDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const endStr = endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${startStr} – ${endStr}`;
};
const formatFullDate = () => new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
  timeZone: "Asia/Kolkata",
});
const formatMoney = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString("en-IN")}`;
const bookingOrder = (a, b) => a.date.localeCompare(b.date) ||
  MEALS.indexOf(a.meal_type) - MEALS.indexOf(b.meal_type);
const mealTimeReached = (date, mealType, schedule, now = Date.now()) => {
  const time = schedule[mealType];
  return time ? now >= Date.parse(`${date}T${time}:00+05:30`) : date < todayIso();
};

function Brand({ compact = false }) {
  return (
    <span className={`brand-lockup${compact ? " compact" : ""}`}>
      <span className="brand-icon"><UtensilsCrossed size={19} /></span>
      <span>{BRAND.name}<small>DINING MADE SIMPLE</small></span>
    </span>
  );
}

function AuthScreen({ onAuth, busy, error }) {
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [slide, setSlide] = useState(0);
  const [carouselFocused, setCarouselFocused] = useState(false);
  const slides = [
    {
      image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1500&q=85",
      title: <>Your daily meals,<br />made simple.</>,
      description: "See the menu, save your seat, and keep track of your meals.",
    },
    {
      image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1500&q=85",
      title: <>Good food,<br />right on time.</>,
      description: "Plan your week with a menu that moves with the calendar.",
    },
    {
      image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1500&q=85",
      title: <>One simple place<br />for every meal.</>,
      description: "Reserve, manage, and review your dining in a few taps.",
    },
  ];

  useEffect(() => {
    if (carouselFocused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => {
      setSlide((current) => (current + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [carouselFocused]);

  const submit = (event) => {
    event.preventDefault();
    onAuth(signup, signup
      ? { name: name.trim(), email: email.trim(), password }
      : { email: email.trim(), password });
  };

  return (
    <main className="auth-page">
      <section
        className="auth-hero"
        aria-roledescription="carousel"
        aria-label="About AARIVA"
        onFocusCapture={() => setCarouselFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setCarouselFocused(false);
        }}
      >
        {slides.map((item, index) => (
          <img
            key={item.image}
            className={`auth-slide-image${slide === index ? " active" : ""}`}
            src={item.image}
            alt=""
            aria-hidden="true"
          />
        ))}
        <Brand />
        <div className="auth-hero-copy">
          <span className="auth-kicker">GOOD FOOD, GOOD DAYS</span>
          <div className="auth-slide-copy" key={slide} aria-live="polite">
            <h1>{slides[slide].title}</h1>
            <p>{slides[slide].description}</p>
          </div>
          <div className="auth-carousel-controls" role="group" aria-label="Choose a featured image">
            <button type="button" aria-label="Previous image" onClick={() => setSlide((slide + slides.length - 1) % slides.length)}>
              <ArrowLeft size={16} />
            </button>
            {slides.map((item, index) => (
              <button
                key={item.image}
                type="button"
                className={slide === index ? "active" : ""}
                aria-label={`Show image ${index + 1} of ${slides.length}`}
                aria-pressed={slide === index}
                onClick={() => setSlide(index)}
              />
            ))}
            <button type="button" aria-label="Next image" onClick={() => setSlide((slide + 1) % slides.length)}>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <span className="auth-hero-foot">A BETTER DINING EXPERIENCE</span>
      </section>
      <section className="auth-card">
        <div className="auth-card-heading">
          <span className="auth-kicker">AARIVA MESS</span>
          <h2>{signup ? "Create your account" : "Welcome back"}</h2>
          <p>{signup ? "Add your details to get started." : "Sign in to see your meals."}</p>
        </div>

        <div className="auth-switch" aria-label="Account options">
          <button type="button" className={!signup ? "active" : ""} onClick={() => setSignup(false)}>Sign in</button>
          <button type="button" className={signup ? "active" : ""} onClick={() => setSignup(true)}>Sign up</button>
        </div>

        {error && <p className="inline-error" role="alert"><CircleAlert size={16} />{error}</p>}

        <form className="auth-form" onSubmit={submit}>
          {signup && (
            <label>
              Name
              <input
                autoComplete="name"
                maxLength={80}
                minLength={2}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                required
                value={name}
              />
            </label>
          )}
          <label>
            Email
            <input
              autoComplete={signup ? "email" : "username"}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <span className="password-field">
              <input
                autoComplete={signup ? "new-password" : "current-password"}
                maxLength={signup ? 128 : undefined}
                minLength={signup ? 8 : 1}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={signup ? "At least 8 characters" : "Your password"}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
            {signup && <small className="field-note">Use at least 8 characters.</small>}
          </label>
          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? "Please wait..." : signup ? "Create account" : "Sign in"}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>

        <p className="auth-footnote">Student accounts only.</p>
      </section>
    </main>
  );
}

function MealCard({ meal, onBook, busy }) {
  const isBooked = meal.myBooking === "confirmed" || meal.myBooking === "attended";
  const bookingClosed = Date.now() >= Date.parse(meal.booking_deadline) ||
    mealTimeReached(meal.date, meal.meal_type, MEAL_STARTS);
  return (
    <article className="meal-card">
      <div className="meal-photo">
        <img src={MEAL_IMAGES[meal.meal_type]} alt="" loading="lazy" />
        <span>{MEAL_NAMES[meal.meal_type]}</span>
      </div>
      <div className="meal-body">
        <div className="meal-title-row">
          <div>
            <h3>{meal.title}</h3>
            <p>{meal.description}</p>
          </div>
          <span className="meal-price">{formatMoney(meal.price_paise)}</span>
        </div>
        <div className="meal-details">
          <span>{formatDate(meal.date)}</span>
          <span>{MEAL_TIMES[meal.meal_type]}</span>
          {meal.allergens && <span>Contains: {meal.allergens}</span>}
        </div>
        {isBooked ? (
          <div className="meal-booked"><Check size={16} /> Reserved</div>
        ) : (
          <button
            className="meal-action"
            disabled={busy || bookingClosed}
            onClick={() => onBook(meal)}
          >
            {bookingClosed ? "Booking closed" : "Reserve this meal"}
            {!bookingClosed && <ArrowRight size={16} />}
          </button>
        )}
      </div>
    </article>
  );
}

function StudentApp() {
  const [token, setToken] = useState(() => localStorage.getItem("aariva_token") || "");
  const [user, setUser] = useState(null);
  const [menus, setMenus] = useState([]);
  const [weekDays, setWeekDays] = useState([]);
  const [weekMeta, setWeekMeta] = useState({
    today: todayIso(),
    weekStart: "",
    weekEnd: "",
    prevWeekStart: "",
    nextWeekStart: "",
    isCurrentWeek: true,
  });
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [bookings, setBookings] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [page, setPage] = useState("home");
  const [menuDate, setMenuDate] = useState("");
  const [mealFilter, setMealFilter] = useState("upcoming");
  const [loading, setLoading] = useState(Boolean(localStorage.getItem("aariva_token")));
  const [clock, setClock] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState("suggestion");
  const [feedbackText, setFeedbackText] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [message, setMessage] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const refresh = useCallback(async (currentToken, targetWeek) => {
    const weekQuery = targetWeek !== undefined ? targetWeek : selectedWeekStart;
    const [menuResult, bookingResult, feedbackResult] = await Promise.all([
      api.menus(currentToken, weekQuery || undefined),
      api.bookings(currentToken),
      api.feedback(currentToken),
    ]);
    const fetchedDays = menuResult.days || [];
    const fetchedMenus = menuResult.menus || [];
    setMenus(fetchedMenus);
    setWeekDays(fetchedDays);
    setWeekMeta({
      today: menuResult.today || todayIso(),
      weekStart: menuResult.weekStart || "",
      weekEnd: menuResult.weekEnd || "",
      prevWeekStart: menuResult.prevWeekStart || "",
      nextWeekStart: menuResult.nextWeekStart || "",
      isCurrentWeek: Boolean(menuResult.isCurrentWeek),
    });
    setMenuDate((current) => {
      if (fetchedDays.some((d) => d.date === current)) return current;
      const todayDay = fetchedDays.find((d) => d.isToday);
      if (todayDay) return todayDay.date;
      return fetchedDays[0]?.date || current;
    });
    setBookings(bookingResult.bookings || []);
    setFeedback(feedbackResult.feedback || []);
  }, [selectedWeekStart]);

  const changeWeek = async (weekStart) => {
    setSelectedWeekStart(weekStart || "");
    if (token) {
      setBusy(true);
      try {
        await refresh(token, weekStart || "");
      } catch (error) {
        setMessage({ text: error.message, kind: "error" });
      } finally {
        setBusy(false);
      }
    }
  };

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    Promise.all([api.me(token), refresh(token)])
      .then(([{ user: currentUser }]) => {
        if (active) setUser(currentUser);
      })
      .catch((error) => {
        if (!active) return;
        if (error.status === 401) {
          localStorage.removeItem("aariva_token");
          setToken("");
          setUser(null);
        } else {
          setMessage({ text: error.message, kind: "error" });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token, refresh]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(null), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
      // When Sunday arrives after Saturday, the week automatically shifts:
      if (!selectedWeekStart && token) {
        const currentToday = todayIso();
        if (weekMeta.today && currentToday !== weekMeta.today) {
          refresh(token, "").catch(() => {});
        }
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [selectedWeekStart, token, weekMeta.today, refresh]);

  const hasMealStarted = (booking) => mealTimeReached(booking.date, booking.meal_type, MEAL_STARTS, clock);
  const hasMealEnded = (booking) => mealTimeReached(booking.date, booking.meal_type, MEAL_ENDS, clock);
  const upcomingBookings = useMemo(() => bookings
    .filter((booking) => booking.status === "confirmed" && !hasMealStarted(booking))
    .sort(bookingOrder), [bookings, clock]);
  const pastBookings = useMemo(() => bookings
    .filter((booking) => booking.status === "attended" ||
      (booking.status === "confirmed" && hasMealStarted(booking)))
    .sort((a, b) => bookingOrder(b, a)), [bookings, clock]);
  const cancelledBookings = useMemo(() => bookings
    .filter((booking) => booking.status === "cancelled")
    .sort((a, b) => bookingOrder(b, a)), [bookings]);
  const visibleBookings = mealFilter === "cancelled"
    ? cancelledBookings
    : mealFilter === "past" ? pastBookings : upcomingBookings;

  const visibleMeals = useMemo(() => menus
    .filter((meal) => meal.date === menuDate)
    .sort((a, b) => MEALS.indexOf(a.meal_type) - MEALS.indexOf(b.meal_type)), [menus, menuDate]);
  const upcomingTotal = useMemo(
    () => upcomingBookings.reduce((total, booking) => total + Number(booking.price_paise || 0), 0),
    [upcomingBookings],
  );

  const homeBookings = upcomingBookings.slice(0, 3);
  const activePage = PAGES.find((item) => item.id === page);

  const authenticate = async (signup, details) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const result = signup
        ? await api.signup(details)
        : await api.login(details.email, details.password);
      localStorage.setItem("aariva_token", result.token);
      setUser(result.user);
      setToken(result.token);
      setPage("home");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const perform = async (task, successText) => {
    setBusy(true);
    try {
      await task();
      await refresh(token);
      if (successText) setMessage({ text: successText, kind: "success" });
    } catch (error) {
      setMessage({ text: error.message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const reserveMeal = (meal) => perform(
    () => api.book(token, meal.id),
    `${meal.title} reserved.`,
  );

  const cancelBooking = (booking) => perform(
    () => api.cancelBooking(token, booking.id),
    "Reservation cancelled.",
  );

  const rebookMeal = (booking) => perform(
    () => api.book(token, booking.menu_id),
    `${booking.title} reserved again.`,
  );

  const submitFeedback = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.submitFeedback(token, {
        category: feedbackCategory,
        message: feedbackText.trim(),
      });
      setFeedbackText("");
      await refresh(token);
      setMessage({ text: "Thanks for helping us improve AARIVA.", kind: "success" });
    } catch (error) {
      setMessage({ text: error.message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const createReceipt = async () => {
    if (!upcomingBookings.length) return;
    setBusy(true);
    setReceipt(null);
    try {
      const result = await api.makeDemoReceipt(token, upcomingBookings.map((booking) => booking.id));
      setReceipt({
        ...result.payment,
        createdAt: new Date().toISOString(),
        bookings: upcomingBookings.map(({ id, title, date, meal_type, price_paise }) => ({
          id, title, date, meal_type, price_paise,
        })),
      });
    } catch (error) {
      setMessage({ text: error.message, kind: "error" });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await api.logout(token);
    } catch (error) {
      setMessage({ text: error.message, kind: "error" });
    }
    localStorage.removeItem("aariva_token");
    setToken("");
    setUser(null);
    setMenus([]);
    setWeekDays([]);
    setBookings([]);
    setReceipt(null);
    setPage("home");
  };

  if (loading) {
    return <main className="loading-view"><Brand /><span className="spinner" /></main>;
  }
  if (!user) return <AuthScreen onAuth={authenticate} busy={authBusy} error={authError} />;

  const pageContent = () => {
    if (page === "menu") {
      const selectedDay = weekDays.find((d) => d.date === menuDate);
      return (
        <>
          <PageHeading title="Menu" subtitle="See what’s cooking and reserve a meal." />

          <div className="week-header-bar">
            <div className="week-label">
              <strong>{formatWeekRange(weekMeta.weekStart, weekMeta.weekEnd)}</strong>
              {weekMeta.isCurrentWeek ? (
                <span className="current-week-tag">This Week</span>
              ) : (
                <button
                  type="button"
                  className="this-week-link"
                  onClick={() => changeWeek("")}
                >
                  Back to This Week
                </button>
              )}
            </div>
            <div className="week-nav-actions">
              <button
                type="button"
                className="quiet-button week-arrow-button"
                disabled={busy}
                onClick={() => changeWeek(weekMeta.prevWeekStart)}
                aria-label="Previous week"
              >
                <ChevronLeft size={15} /> Prev
              </button>
              <button
                type="button"
                className="quiet-button week-arrow-button"
                disabled={busy}
                onClick={() => changeWeek(weekMeta.nextWeekStart)}
                aria-label="Next week"
              >
                Next <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div className="date-switch" role="group" aria-label="Choose a menu day">
            {weekDays.map((day) => (
              <button
                key={day.date}
                type="button"
                aria-pressed={menuDate === day.date}
                aria-label={`${day.dayName}, ${day.dayNumber} ${day.monthShort}`}
                className={menuDate === day.date ? "active" : ""}
                onClick={() => setMenuDate(day.date)}
              >
                <span>{day.dayShort}</span>
                <strong>{day.dayNumber}</strong>
                <small>{day.isToday ? "Today" : day.isTomorrow ? "Tomorrow" : day.monthShort}</small>
              </button>
            ))}
          </div>
          {visibleMeals.length ? (
            <div className="meal-grid">
              {visibleMeals.map((meal) => (
                <MealCard key={meal.id} meal={meal} onBook={reserveMeal} busy={busy} />
              ))}
            </div>
          ) : (
            <EmptyMessage
              title={`No menu for ${selectedDay ? `${selectedDay.dayName}, ${selectedDay.dayNumber} ${selectedDay.monthShort}` : "this day"}`}
              text="Check another day above or choose Today."
              action={weekMeta.today && menuDate !== weekMeta.today ? "Show today" : undefined}
              onAction={() => setMenuDate(weekMeta.today)}
            />
          )}
        </>
      );
    }

    if (page === "meals") {
      return (
        <>
          <PageHeading title="My meals" subtitle="Manage reservations and check your meal history." />
          <div className="meal-filters" role="tablist" aria-label="Filter reservations">
            {[
              ["upcoming", "Upcoming", upcomingBookings.length],
              ["past", "Past meals", pastBookings.length],
              ["cancelled", "Cancelled", cancelledBookings.length],
            ].map(([filter, label, count]) => (
              <button
                key={filter}
                type="button"
                role="tab"
                aria-selected={mealFilter === filter}
                className={mealFilter === filter ? "active" : ""}
                onClick={() => setMealFilter(filter)}
              >
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
          {visibleBookings.length ? (
            <div className="booking-list">
              {visibleBookings.map((booking) => (
                <article className="booking-row" key={booking.id}>
                  <span className="booking-icon"><Coffee size={20} /></span>
                  <div className="booking-info">
                    <strong>{booking.title}</strong>
                    <span>{MEAL_NAMES[booking.meal_type]} · {formatDate(booking.date)} · {MEAL_TIMES[booking.meal_type]}</span>
                  </div>
                  <span className="meal-price">{formatMoney(booking.price_paise)}</span>
                  {mealFilter === "upcoming" && (
                    !hasMealStarted(booking) &&
                    (!booking.booking_deadline || clock < Date.parse(booking.booking_deadline))
                      ? <button className="quiet-button" disabled={busy} onClick={() => cancelBooking(booking)}>Cancel</button>
                      : <span className="booking-status">{hasMealEnded(booking) ? "Finished" : "In progress"}</span>
                  )}
                  {mealFilter === "past" && (
                    <span className="booking-status">{booking.status === "attended" ? "Attended" : hasMealEnded(booking) ? "Finished" : "In progress"}</span>
                  )}
                  {mealFilter === "cancelled" && (
                    booking.date >= todayIso() && !hasMealStarted(booking) &&
                    (!booking.booking_deadline || clock < Date.parse(booking.booking_deadline))
                      ? <button className="quiet-button rebook-button" disabled={busy} onClick={() => rebookMeal(booking)}>Book again</button>
                      : <span className="booking-status">Cancelled</span>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyMessage
              title={mealFilter === "upcoming" ? "No upcoming reservations" : mealFilter === "past" ? "No past meals" : "No cancelled reservations"}
              text={mealFilter === "upcoming"
                ? "Browse this week’s menu and reserve a meal."
                : mealFilter === "past" ? "Meals that have started will appear here." : "Reservations you cancel will appear here."}
              action={mealFilter === "upcoming" ? "Browse this week’s menu" : undefined}
              onAction={() => setPage("menu")}
            />
          )}
        </>
      );
    }

    if (page === "bill") {
      const total = upcomingTotal;
      return (
        <>
          <PageHeading title="My bill" subtitle="An itemized summary of your upcoming meal reservations." />
          <section className="bill-card">
            <div className="demo-banner">
              <CircleAlert size={18} />
              <span><strong>DEMO BILL PREVIEW</strong><small>Itemized summary of your meal reservations.</small></span>
            </div>
            <div className="bill-card-top">
              <div><h2>Meal summary</h2><p>{upcomingBookings.length} upcoming {upcomingBookings.length === 1 ? "reservation" : "reservations"}</p></div>
              <span className="bill-total">{formatMoney(total)}</span>
            </div>
            {upcomingBookings.length ? (
              <div className="bill-list">
                {upcomingBookings.map((booking) => (
                  <div className="bill-row" key={booking.id}>
                    <span>
                      <strong>{booking.title}</strong>
                      <small>{MEAL_NAMES[booking.meal_type]} · {formatDate(booking.date)} · Qty 1</small>
                    </span>
                    <strong>{formatMoney(booking.price_paise)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyMessage
                title="Your bill is empty"
                text="Reserve a meal and its cost will appear here."
                action="See menu"
                onAction={() => setPage("menu")}
              />
            )}
            <div className="bill-total-row"><span>Total</span><strong>{formatMoney(total)}</strong></div>
            <button className="primary-button full-button" disabled={busy || !upcomingBookings.length} onClick={createReceipt}>
              {busy ? "Preparing preview..." : "Create demo bill preview"}
              {!busy && <ArrowRight size={17} />}
            </button>
            <p className="bill-note">Each amount comes from the meal’s configured price.</p>
            {receipt && (
              <section className="receipt-preview" aria-label="Simulated bill preview" aria-live="polite">
                <div className="receipt-preview-head">
                  <div>
                    <span className="receipt-overline">AARIVA · STUDENT DINING</span>
                    <h2>Meal bill preview</h2>
                    <p>Reservation summary</p>
                  </div>
                  <span className="receipt-stamp">SAMPLE<br />PREVIEW</span>
                </div>
                <div className="receipt-meta">
                  <span><small>Preview reference</small><strong>{receipt.reference}</strong></span>
                  <span><small>Prepared for</small><strong>{user.name}</strong><small>{user.email}</small></span>
                  <span>
                    <small>Created</small>
                    <strong>{new Date(receipt.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</strong>
                  </span>
                </div>
                <div className="receipt-items">
                  <div className="receipt-table-head"><span>MEAL</span><span>DATE</span><span>AMOUNT</span></div>
                  {receipt.bookings.map((booking) => (
                    <div className="receipt-item" key={booking.id}>
                      <span><strong>{booking.title}</strong><small>{MEAL_NAMES[booking.meal_type]}</small></span>
                      <span>{formatDate(booking.date)}</span>
                      <strong>{formatMoney(booking.price_paise)}</strong>
                    </div>
                  ))}
                </div>
                <div className="receipt-total">
                  <span>Total shown · {receipt.mealCount} meals</span>
                  <strong>{formatMoney(receipt.amountPaise)}</strong>
                </div>
                <div className="receipt-disclaimer">
                  <CircleAlert size={17} />
                  <span><strong>Sample reservation summary</strong><small>No payment is processed by this preview.</small></span>
                </div>
                <button className="quiet-button receipt-print" onClick={() => window.print()}>
                  <Printer size={16} /> Print demo preview
                </button>
              </section>
            )}
          </section>
        </>
      );
    }

    if (page === "feedback") {
      return (
        <>
          <PageHeading title="Feedback" subtitle="Report a problem or share an idea to improve AARIVA." />
          <div className="feedback-layout">
            <section className="feedback-card">
              <h2>Send us a message</h2>
              <p>Your feedback is saved with your student account.</p>
              <form className="feedback-form" onSubmit={submitFeedback}>
                <label>
                  What is this about?
                  <select value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value)}>
                    <option value="suggestion">A suggestion</option>
                    <option value="error">Report a problem</option>
                  </select>
                </label>
                <label>
                  Your message
                  <textarea
                    maxLength={2000}
                    minLength={10}
                    onChange={(event) => setFeedbackText(event.target.value)}
                    placeholder={feedbackCategory === "error"
                      ? "What happened? Include the page and steps if you can."
                      : "What would make your dining experience better?"}
                    required
                    rows={6}
                    value={feedbackText}
                  />
                </label>
                <div className="feedback-form-foot">
                  <small>{feedbackText.length} / 2,000 characters · at least 10 to send</small>
                  <button className="primary-button" disabled={busy || feedbackText.trim().length < 10}>
                    {busy ? "Sending..." : "Send feedback"}
                    {!busy && <ArrowRight size={16} />}
                  </button>
                </div>
              </form>
            </section>
            <section className="feedback-history">
              <div className="section-title">
                <div><h2>Your messages</h2><small>Your latest 20 submissions</small></div>
              </div>
              {feedback.length ? (
                <div className="feedback-list">
                  {feedback.map((entry) => (
                    <article className="feedback-entry" key={entry.id}>
                      <div>
                        <span className={`feedback-type ${entry.category}`}>
                          {entry.category === "error" ? "Problem report" : "Suggestion"}
                        </span>
                        <time dateTime={entry.created_at}>
                          {new Date(entry.created_at).toLocaleString("en-IN", {
                            dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
                          })}
                        </time>
                      </div>
                      <p>{entry.message}</p>
                      <small className="feedback-status">{entry.status === "received" ? "Received" : entry.status}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyMessage title="No messages yet" text="Your feedback will appear here after you send it." />
              )}
            </section>
          </div>
        </>
      );
    }

    if (page === "account") {
      return (
        <>
          <PageHeading title="Account" subtitle="Your sign-in details." />
          <section className="account-card">
            <span className="account-avatar">{user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
            <div><strong>{user.name}</strong><span>{user.email}</span><small>Student account</small></div>
            <button className="quiet-button signout-button" onClick={signOut}><LogOut size={16} /> Sign out</button>
          </section>
        </>
      );
    }

    return (
      <>
        <div className="welcome-row">
          <div>
            <span className="page-date">{formatFullDate()}</span>
            <h1>Hi, {user.name.split(" ")[0]}.</h1>
            <p>Ready to see what’s on the menu?</p>
          </div>
          <span className="welcome-mark"><UtensilsCrossed size={26} /></span>
        </div>
        <button
          className="home-menu-card"
          onClick={() => {
            if (weekMeta.today) setMenuDate(weekMeta.today);
            if (!weekMeta.isCurrentWeek) changeWeek("");
            setPage("menu");
          }}
        >
          <span className="home-menu-icon"><UtensilsCrossed size={22} /></span>
          <span><strong>Today’s menu</strong><small>See meals and reserve your plate</small></span>
          <ArrowRight size={19} />
        </button>
        <section className="home-summary">
          <div className="section-title">
            <div><h2>Coming up</h2><small>{upcomingBookings.length} upcoming {upcomingBookings.length === 1 ? "meal" : "meals"}</small></div>
            <button onClick={() => { setMealFilter("upcoming"); setPage("meals"); }}>
              All my meals <ChevronRight size={16} />
            </button>
          </div>
          {homeBookings.length ? (
            <div className="home-booking-list">
              {homeBookings.map((booking) => (
                <article className="next-meal-card" key={booking.id}>
                  <span className="booking-icon"><Coffee size={20} /></span>
                  <span>
                    <strong>{booking.title}</strong>
                    <small>{MEAL_NAMES[booking.meal_type]} · {formatDate(booking.date)} · {MEAL_TIMES[booking.meal_type]}</small>
                  </span>
                  <strong className="meal-price">{formatMoney(booking.price_paise)}</strong>
                </article>
              ))}
              {upcomingBookings.length > homeBookings.length && (
                <button className="more-meals-link" onClick={() => { setMealFilter("upcoming"); setPage("meals"); }}>
                  View all {upcomingBookings.length} upcoming meals
                </button>
              )}
            </div>
          ) : (
            <EmptyMessage title="Nothing coming up yet" text="Choose meals from this week’s menu to fill your plan." action="Browse this week’s menu" onAction={() => setPage("menu")} />
          )}
        </section>
        <button className="home-bill-link" onClick={() => setPage("bill")}>
          <span><CreditCard size={19} /><strong>My bill</strong><small>{upcomingBookings.length} upcoming · {formatMoney(upcomingTotal)}</small></span>
          <ChevronRight size={18} />
        </button>
      </>
    );
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <a className="sidebar-brand" href="#home" onClick={(event) => { event.preventDefault(); setPage("home"); }}>
          <Brand compact />
        </a>
        <nav className="main-nav" aria-label="Main menu">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <button className={`sidebar-account${page === "account" ? " active" : ""}`} onClick={() => setPage("account")}>
          <span className="account-avatar small">{user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
          <span><strong>{user.name}</strong><small>Account</small></span>
          <UserRound size={17} />
        </button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div><span className="topbar-brand">{BRAND.name}</span><span className="breadcrumb-separator">/</span><strong>{activePage?.label}</strong></div>
          <button className="topbar-account" onClick={() => setPage("account")} aria-label="Open account">
            <span className="account-avatar small">{user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
          </button>
        </header>
        <div className="page-content">{pageContent()}</div>
        <nav className="mobile-nav" aria-label="Main menu">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
      </main>

      {message && (
        <div className={`toast-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

function PageHeading({ title, subtitle }) {
  return <header className="page-heading"><h1>{title}</h1><p>{subtitle}</p></header>;
}

function EmptyMessage({ title, text, action, onAction }) {
  return (
    <div className="empty-message">
      <span><CalendarDays size={23} /></span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && <button className="text-button" onClick={onAction}>{action}<ArrowRight size={15} /></button>}
    </div>
  );
}

export default StudentApp;
