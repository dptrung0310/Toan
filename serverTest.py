from flask import Flask, request, jsonify, make_response
import sqlite3, hashlib, json
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

DB_NAME = "books.db"
API_TOKEN = "demo123"

# ---------------------------
# Hàm tiện ích
# --------------------------
def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS borrowed_books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_key TEXT UNIQUE,
            title TEXT,
            author TEXT,
            cover_url TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

def check_auth():
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return False
    token = auth_header.split(" ")[1]
    return token == API_TOKEN

@app.before_request
def require_auth():
    if request.path == "/" or request.method == "OPTIONS":
        return
    if not check_auth():
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

@app.route("/")
def home():
    return "Flask Library API - Version 5 Layered"

# ---------------------------
# API: Mượn sách
# ---------------------------
@app.route("/api/v5/books", methods=["POST"])
def borrow_book():
    data = request.get_json()
    book_key = data.get("book_key")
    title = data.get("title")
    author = data.get("author")
    cover_url = data.get("cover_url")

    if not book_key:
        return jsonify({"status": "error", "message": "Missing book_key"}), 400

    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("SELECT * FROM borrowed_books WHERE book_key = ?", (book_key,))
    existing = c.fetchone()

    if existing:
        conn.close()
        return jsonify({"status": "exists", "message": "Already borrowed"}), 200

    c.execute(
        "INSERT INTO borrowed_books (book_key, title, author, cover_url) VALUES (?, ?, ?, ?)",
        (book_key, title, author, cover_url)
    )
    conn.commit()
    conn.close()

    response = {
        "status": "success",
        "message": "Borrowed successfully",
        "data": {
            "book_key": book_key,
            "_links": {
                "self": {"href": f"/api/books/{book_key}", "method": "GET"},
                "return": {"href": f"/api/books/{book_key}", "method": "DELETE"},
                "all": {"href": "/api/books", "method": "GET"}
            }
        }
    }
    return jsonify(response), 201

# ---------------------------
# API lấy danh sách đã mượn
# ---------------------------
@app.route("/api/v5/books", methods=["GET"])
def get_books():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("SELECT book_key, title, author, cover_url FROM borrowed_books")
    rows = c.fetchall()
    conn.close()

    books = [
        {
            "book_key": r[0],
            "title": r[1],
            "author": r[2],
            "cover_url": r[3],
            "_links": {
                "self": {"href": f"/api/books/{r[0]}", "method": "GET"},
                "return": {"href": f"/api/books/{r[0]}", "method": "DELETE"}
            }
        }
        for r in rows
    ]

    etag = hashlib.md5(json.dumps(books, sort_keys=True).encode()).hexdigest()
    client_etag = request.headers.get("If-None-Match")
    if client_etag == etag:
        return make_response("", 304)
    response = make_response(jsonify({
        "status": "success",
        "message": "Get borrowed books successfully",
        "data": books,
        "_links": {
            "self": {"href": "/api/books", "method": "GET"},
            "borrow": {"href": "/api/books", "method": "POST"}
        }
    }))
    response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["ETag"] = etag
    response.headers["Access-Control-Expose-Headers"] = "ETag"

    return response, 200

# ---------------------------
# API: Lấy thông tin một cuốn sách
# ---------------------------
@app.route("/api/v5/books/<book_key>", methods=["GET"])
def get_book(book_key):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("SELECT book_key, title, author, cover_url FROM borrowed_books WHERE book_key = ?", (book_key,))
    book = c.fetchone()
    conn.close()

    if not book:
        return jsonify({"status": "error", "message": "Book not found"}), 404

    etag = hashlib.md5(json.dumps(book, sort_keys=True).encode()).hexdigest()

    client_etag = request.headers.get("If-None-Match")
    if client_etag == etag:
        return "", 304
    
    payload = {
        "status": "success",
        "message": "Get a borrowed book successfully",
        "data": {
            "book_key": book[0],
            "title": book[1],
            "author": book[2],
            "cover_url": book[3],
            "_links": {
                "self": {"href": f"/api/books/{book[0]}", "method": "GET"},
                "return": {"href": f"/api/books/{book[0]}", "method": "DELETE"},
                "all": {"href": "/api/books", "method": "GET"}
            }
        }
    }

    response = make_response(jsonify(payload))
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["Access-Control-Expose-Headers"] = "ETag"

    return response

# ---------------------------
# API: Trả sách
# ---------------------------

@app.route("/api/v5/books/<book_key>", methods=["DELETE"])

def return_book(book_key):
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("DELETE FROM borrowed_books WHERE book_key = ?", (book_key,))
    deleted = c.rowcount
    conn.commit()
    conn.close()

    if deleted == 0:
        return jsonify({"status": "error", "message": "Book not found"}), 404

    return jsonify({
        "status": "success",
        "message": "Returned successfully",
        "data": {
            "_links": {
                "all": {"href": "/api/books", "method": "GET"},
                "borrow": {"href": "/api/books", "method": "POST"}
            }
        }
    }), 200 


if __name__ == "__main__":
    app.run(debug=True)
