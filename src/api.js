const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function request(path, token, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    const error = new Error("Cannot connect to AARIVA. Check that the server is running.");
    error.status = 503;
    throw error;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "Something went wrong. Please try again.");
    error.status = response.status;
    throw error;
  }
  return body;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  signup: (details) => request("/auth/signup", null, json("POST", details)),
  login: (email, password) => request("/auth/login", null, json("POST", { email, password })),
  me: (token) => request("/auth/me", token),
  logout: (token) => request("/auth/logout", token, json("POST", {})),
  menus: (token, weekStart) => request(`/menus${weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : ""}`, token),
  bookings: (token) => request("/bookings", token),
  feedback: (token) => request("/feedback", token),
  submitFeedback: (token, details) => request("/feedback", token, json("POST", details)),
  book: (token, menuId) => request("/bookings", token, json("POST", { menuId })),
  cancelBooking: (token, bookingId) => request(`/bookings/${encodeURIComponent(bookingId)}/cancel`, token, json("PATCH", {})),
  makeDemoReceipt: (token, bookingIds) => request("/payments/demo", token, json("POST", { bookingIds })),
};
