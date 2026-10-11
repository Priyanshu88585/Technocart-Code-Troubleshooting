const totalCount = document.querySelector("#total-count");
const stats = document.querySelector("#stats");
const searchInput = document.querySelector("#search");
const categorySelect = document.querySelector("#category");
const addButton = document.querySelector("#add-book");
const bookRows = document.querySelector("#book-rows");
const message = document.querySelector("#message");
const dialog = document.querySelector("#book-dialog");
const form = document.querySelector("#book-form");
const formTitle = document.querySelector("#form-title");
const cancelButton = document.querySelector("#cancel-form");

const booksById = new Map();
let editingId = null;
let pendingQuery = "";

function init() {
  searchInput.addEventListener("input", () => {
    loadBooks(searchInput.value.trim());
  });
  categorySelect.addEventListener("change", () => {
    loadBooks();
  });
  addButton.addEventListener("click", () => {
    openCreate();
  });
  cancelButton.addEventListener("click", () => {
    dialog.close();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveBook();
  });
  bookRows.addEventListener("click", onRowClick);
  refresh();
}

async function refresh() {
  await Promise.all([loadStats(), loadCategories(), loadBooks()]);
}

async function loadStats() {
  const response = await fetch("/api/dashboard/stats");
  const data = await readJson(response);
  if (!response.ok) {
    showError(data.error);
    return;
  }
  totalCount.textContent = `${data.total_books} titles`;
  const categoryItems = data.books_by_category
    .map((item) => `<li><span>${escapeHtml(item.category)}</span><strong>${item.count}</strong></li>`)
    .join("");
  stats.innerHTML = `
    <article class="stat-card"><span>Titles</span><strong>${data.total_books}</strong></article>
    <article class="stat-card"><span>Copies in stock</span><strong>${data.available_copies}</strong></article>
    <article class="stat-card"><span>By category</span><ul class="stat-list">${categoryItems}</ul></article>
  `;
}

async function loadCategories() {
  const response = await fetch("/api/categories");
  const data = await readJson(response);
  if (!response.ok) {
    showError(data.error);
    return;
  }
  const current = categorySelect.value;
  categorySelect.innerHTML = `<option value="">All categories</option>${data
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("")}`;
  categorySelect.value = data.includes(current) ? current : "";
}

async function loadBooks(query = searchInput.value.trim()) {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (categorySelect.value) {
    params.set("category", categorySelect.value);
  }
  const response = await fetch(`/api/books?${params.toString()}`);
  const data = await readJson(response);
  if (!response.ok) {
    showError(data.error);
    return;
  }
  renderBooks(data);
}

function renderBooks(books) {
  booksById.clear();
  if (!books.length) {
    bookRows.innerHTML = `<tr><td colspan="7">No books found.</td></tr>`;
    return;
  }
  bookRows.innerHTML = books
    .map((book) => {
      booksById.set(String(book.id), book);
      return `<tr>
        <td>${escapeHtml(book.title)}</td>
        <td>${escapeHtml(book.author)}</td>
        <td>${escapeHtml(book.category)}</td>
        <td>${book.published_year}</td>
        <td>${Number(book.price).toFixed(2)}</td>
        <td>
          <span class="stock-controls">
            <button type="button" class="secondary" data-action="decrease" data-id="${book.id}">-</button>
            <span>${book.quantity}</span>
            <button type="button" class="secondary" data-action="increase" data-id="${book.id}">+</button>
          </span>
        </td>
        <td>
          <div class="row-actions">
            <button type="button" class="secondary" data-action="edit" data-id="${book.id}">Edit</button>
            <button type="button" class="danger" data-action="delete" data-id="${book.id}">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function onRowClick(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === "edit") {
    openEdit(id);
  } else if (action === "delete") {
    deleteBook(id);
  } else if (action === "increase") {
    adjustStock(id, 1);
  } else if (action === "decrease") {
    adjustStock(id, -1);
  }
}

function openCreate() {
  editingId = null;
  form.reset();
  formTitle.textContent = "Add book";
  message.textContent = "";
  dialog.showModal();
}

function openEdit(id) {
  const book = booksById.get(String(id));
  if (!book) {
    return;
  }
  editingId = book.id;
  formTitle.textContent = "Edit book";
  form.elements.title.value = book.title;
  form.elements.author.value = book.author;
  form.elements.isbn.value = book.isbn;
  form.elements.category.value = book.category;
  form.elements.published_year.value = book.published_year;
  form.elements.price.value = book.price;
  form.elements.quantity.value = book.quantity;
  message.textContent = "";
  dialog.showModal();
}

async function saveBook() {
  const payload = {
    title: form.elements.title.value,
    author: form.elements.author.value,
    isbn: form.elements.isbn.value,
    category: form.elements.category.value,
    published_year: Number(form.elements.published_year.value),
    price: Number(form.elements.price.value),
    quantity: Number(form.elements.quantity.value),
  };
  const response = await fetch(editingId ? `/api/books/${editingId}` : "/api/books", {
    method: editingId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJson(response);
  if (!response.ok) {
    showError(data.error);
    return;
  }
  dialog.close();
  message.textContent = "";
  await refresh();
}

async function deleteBook(id) {
  const book = booksById.get(String(id));
  if (!book || !window.confirm(`Delete ${book.title}?`)) {
    return;
  }
  const response = await fetch(`/api/books/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await readJson(response);
    showError(data.error);
    return;
  }
  message.textContent = "";
  await refresh();
}

async function adjustStock(id, adjustment) {
  const response = await fetch(`/api/books/${id}/stock`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adjustment }),
  });
  const data = await readJson(response);
  if (!response.ok) {
    showError(data.error);
    return;
  }
  message.textContent = "";
  await refresh();
}

async function readJson(response) {
  if (response.status === 204) {
    return {};
  }
  return response.json();
}

function showError(text) {
  message.textContent = text || "Request failed";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
