const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const { openDatabase } = require("../src/database/init");
const { createApp } = require("../src/app");

describe("book catalog", () => {
  let db;
  let app;
  let dbPath;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `books-${process.pid}-${Date.now()}.db`);
    db = openDatabase(dbPath);
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dbPath, { force: true });
  });

  test("lists the seeded books", async () => {
    const response = await request(app).get("/api/books");
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThanOrEqual(15);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        title: expect.any(String),
        author: expect.any(String),
        isbn: expect.any(String),
        category: expect.any(String),
        published_year: expect.any(Number),
        price: expect.any(Number),
        quantity: expect.any(Number),
      })
    );
  });

  test("returns one book", async () => {
    const list = await request(app).get("/api/books");
    const response = await request(app).get(`/api/books/${list.body[0].id}`);
    expect(response.status).toBe(200);
    expect(response.body.title).toBe(list.body[0].title);
  });

  test("returns 404 when the book does not exist", async () => {
    const response = await request(app).get("/api/books/99999");
    expect(response.status).toBe(404);
  });

  test("creates a book", async () => {
    const response = await request(app).post("/api/books").send({
      title: "New Title",
      author: "New Author",
      isbn: "9780000000002",
      category: "Fiction",
      published_year: 2020,
      price: 9.5,
      quantity: 2,
    });
    expect(response.status).toBe(201);
    expect(response.body.title).toBe("New Title");
    expect(response.body.isbn).toBe("9780000000002");
  });

  test("rejects a book without a title", async () => {
    const response = await request(app).post("/api/books").send({
      author: "New Author",
      isbn: "9780000000002",
      category: "Fiction",
      published_year: 2020,
      price: 9.5,
      quantity: 2,
    });
    expect(response.status).toBe(400);
  });

  test("rejects a duplicate isbn", async () => {
    const response = await request(app).post("/api/books").send({
      title: "Another Dune",
      author: "Someone",
      isbn: "9780441172719",
      category: "Fiction",
      published_year: 2020,
      price: 10,
      quantity: 1,
    });
    expect(response.status).toBe(409);
  });

  test("deletes a book", async () => {
    const created = await request(app).post("/api/books").send({
      title: "Temporary",
      author: "Someone",
      isbn: "9780000000003",
      category: "History",
      published_year: 2010,
      price: 8,
      quantity: 1,
    });
    const removed = await request(app).delete(`/api/books/${created.body.id}`);
    const missing = await request(app).get(`/api/books/${created.body.id}`);
    expect(removed.status).toBe(204);
    expect(missing.status).toBe(404);
  });

  test("lists categories", async () => {
    const response = await request(app).get("/api/categories");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.arrayContaining(["Fiction", "Science", "History", "Technology", "Biography"]));
  });

  test("returns dashboard totals", async () => {
    const response = await request(app).get("/api/dashboard/stats");
    expect(response.status).toBe(200);
    expect(response.body.total_books).toBeGreaterThanOrEqual(15);
    expect(typeof response.body.available_copies).toBe("number");
    expect(Array.isArray(response.body.books_by_category)).toBe(true);
  });

  test("finds books from the search box query", async () => {
    const response = await request(app).get("/api/books").query({ q: "Dune" });
    expect(response.status).toBe(200);
    expect(response.body.some((book) => book.title === "Dune")).toBe(true);
  });

  test("increases stock by one", async () => {
    const list = await request(app).get("/api/books");
    const book = list.body[0];
    const response = await request(app).patch(`/api/books/${book.id}/stock`).send({ adjustment: 1 });
    expect(response.status).toBe(200);
    expect(response.body.quantity).toBe(book.quantity + 1);
  });

  test("filters books by category", async () => {
    const response = await request(app).get("/api/books").query({ category: "Science" });
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body.every((book) => book.category === "Science")).toBe(true);
  });

  test("decreases stock by one", async () => {
    const list = await request(app).get("/api/books");
    const book = list.body.find((b) => b.quantity > 1);
    const response = await request(app).patch(`/api/books/${book.id}/stock`).send({ adjustment: -1 });
    expect(response.status).toBe(200);
    expect(response.body.quantity).toBe(book.quantity - 1);
  });

  test("searches books via dedicated search endpoint", async () => {
    const response = await request(app).get("/api/books/search").query({ q: "Dune" });
    expect(response.status).toBe(200);
    expect(response.body.some((book) => book.title === "Dune")).toBe(true);
  });

  test("updates a book", async () => {
    const list = await request(app).get("/api/books");
    const book = list.body[0];
    const response = await request(app)
      .put(`/api/books/${book.id}`)
      .send({
        title: "Updated Title",
        author: book.author,
        isbn: book.isbn,
        category: book.category,
        published_year: 2021,
        price: 24.99,
        quantity: 5,
      });
    expect(response.status).toBe(200);
    expect(response.body.title).toBe("Updated Title");
    expect(response.body.published_year).toBe(2021);
    expect(response.body.price).toBe(24.99);
  });

  test("serves the catalog page", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Add book");
  });
});
