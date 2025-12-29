const API_BASE = "http://localhost:5000";

export async function callApi(endpoint, method = "GET", payload = {}) {
  const isGet = method === "GET";
  const options = {
    method,
    headers: { "Content-Type": "application/json" },
    body: isGet ? undefined : JSON.stringify(payload),
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (error) {
    return { ok: false, data: { status: "error", message: error.message } };
  }
}

export const api = {
  // Auth
  register: (username, password, role) =>
    callApi("/users/register", "POST", { username, password, role }),

  login: (username, password) =>
    callApi("/users/login", "POST", { username, password }),

  // Books
  searchBooks: (q = "") =>
    callApi(q ? `/books?q=${encodeURIComponent(q)}` : "/books"),

  getBook: (id) => callApi(`/books/${id}`),

  createBook: (creds, title, author, description, url_image, quantity) =>
    callApi("/books", "POST", {
      ...creds,
      title,
      author,
      description,
      url_image,
      quantity,
    }),

  updateBook: (creds, id, fields) =>
    callApi(`/books/${id}`, "PATCH", { ...creds, ...fields }),

  deleteBook: (creds, id) => callApi(`/books/${id}`, "DELETE", creds),

  deleteBorrowRequest: (creds, id) =>
    callApi(`/borrow-requests/${id}`, "DELETE", creds),
  // Borrow
  createBorrowRequest: (creds, book_id) =>
    callApi("/borrow-requests", "POST", { ...creds, book_id }),

  listBorrowRequests: (status = "") =>
    callApi(
      status
        ? `/borrow-requests?status=${encodeURIComponent(status)}`
        : "/borrow-requests"
    ),

  approveBorrow: (creds, req_id) =>
    callApi(`/borrow-requests/${req_id}/approve`, "POST", creds),

  requestReturn: (creds, req_id) =>
    callApi(`/borrow-requests/${req_id}/return`, "POST", creds),

  confirmReturn: (creds, req_id) =>
    callApi(`/borrow-requests/${req_id}/confirm-return`, "POST", creds),

  // Rating
  rateBook: (creds, book_id, rating, comment) =>
    callApi(`/books/${book_id}/rating`, "POST", { ...creds, rating, comment }),
};
