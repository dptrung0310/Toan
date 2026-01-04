import os
import uuid
import base64
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from flask import Flask, jsonify, request
from typing import Any, Dict, Optional, Tuple
from contextlib import contextmanager

app = Flask(__name__)

# Cấu hình kết nối: Lấy DATABASE_URL từ .env (local) hoặc Render Settings
# Tự động thêm sslmode=require nếu chưa có để đảm bảo kết nối được Cloud
DB_URL = os.environ.get('DATABASE_URL', '')
if DB_URL and "sslmode" not in DB_URL:
    if "?" in DB_URL:
        DB_URL += "&sslmode=require"
    else:
        DB_URL += "?sslmode=require"

@contextmanager
def get_db_connection():
    """Quản lý kết nối PostgreSQL an toàn"""
    conn = psycopg2.connect(DB_URL)
    try:
        yield conn
    finally:
        conn.close()

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/<path:path>', methods=['OPTIONS'])
@app.route('/', methods=['OPTIONS'])
def handle_options(path=None):
    """Xử lý CORS preflight requests"""
    return '', 204

def response(status: str, message: str, data: Any = None, http_code: int = 200):
    payload = {"status": status, "message": message, "data": data}
    return jsonify(payload), http_code

def init_db():
    """Khởi tạo cấu trúc bảng trên PostgreSQL"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Tạo bảng Users
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user','librarian'))
                );
            """)
            # Tạo bảng Books
            cur.execute("""
                CREATE TABLE IF NOT EXISTS books (
                    id SERIAL PRIMARY KEY,
                    title TEXT NOT NULL,
                    author TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    url_image TEXT DEFAULT '',
                    quantity INTEGER NOT NULL DEFAULT 1,
                    available INTEGER NOT NULL DEFAULT 1
                );
            """)
            # Tạo bảng Borrow Requests
            cur.execute("""
                CREATE TABLE IF NOT EXISTS borrow_requests (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    book_id INTEGER NOT NULL REFERENCES books(id),
                    batch_id TEXT,
                    status TEXT NOT NULL CHECK(status IN ('pending','submitted','approved','return_requested','returned')),
                    rating INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            # Tạo bảng Reviews
            cur.execute("""
                CREATE TABLE IF NOT EXISTS reviews (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    book_id INTEGER NOT NULL REFERENCES books(id),
                    rating INTEGER NOT NULL,
                    comment TEXT DEFAULT ''
                );
            """)
            
            # Insert dữ liệu mẫu nếu bảng trống
            cur.execute("SELECT 1 FROM users LIMIT 1")
            if not cur.fetchone():
                cur.execute("INSERT INTO users (username, password, role) VALUES (%s, %s, %s)", ("user1", "pass1", "user"))
                cur.execute("INSERT INTO users (username, password, role) VALUES (%s, %s, %s)", ("librarian1", "pass1", "librarian"))
            
            cur.execute("SELECT 1 FROM books LIMIT 1")
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO books (title, author, description, url_image, quantity, available) VALUES (%s, %s, %s, %s, %s, %s)",
                    ("Book One", "Author A", "A great book", "https://picsum.photos/seed/book1/400/600", 5, 5)
                )
                cur.execute(
                    "INSERT INTO books (title, author, description, url_image, quantity, available) VALUES (%s, %s, %s, %s, %s, %s)",
                    ("Book Two", "Author B", "Another book", "https://picsum.photos/seed/book2/400/600", 3, 3)
                )
            conn.commit()
    print("✅ PostgreSQL Database Initialized")

def get_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM users WHERE username=%s AND password=%s", (username, password))
            user = cur.fetchone()
            return dict(user) if user else None

def require_auth(payload: Dict[str, Any], role: Optional[str] = None) -> Tuple[Optional[Dict[str, Any]], Optional[Any]]:
    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        return None, response("error", "Missing username/password", http_code=401)
    user = get_user(username, password)
    if not user:
        return None, response("error", "Invalid credentials", http_code=401)
    if role and user["role"] != role:
        return None, response("error", "Forbidden", http_code=403)
    return user, None

@app.route("/users/register", methods=["POST"])
def register_user():
    data = request.get_json(force=True)
    username, password, role = data.get("username"), data.get("password"), data.get("role", "user")
    if role not in ("user", "librarian"):
        return response("error", "Role must be user or librarian", http_code=400)
    if not username or not password:
        return response("error", "Username and password required", http_code=400)
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO users (username, password, role) VALUES (%s,%s,%s)", (username, password, role))
                conn.commit()
        return response("success", "User registered", {"username": username, "role": role}, 201)
    except psycopg2.IntegrityError:
        return response("error", "Username already exists", http_code=409)

@app.route("/users/login", methods=["POST"])
def login_user():
    data = request.get_json(force=True)
    user = get_user(data.get("username", ""), data.get("password", ""))
    if not user:
        return response("error", "Invalid credentials", http_code=401)
    return response("success", "Login ok", {"id": user["id"], "username": user["username"], "role": user["role"]})

@app.route("/books", methods=["GET"])
def list_books():
    keyword = request.args.get("q", "").lower()
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM books WHERE lower(title) LIKE %s OR lower(author) LIKE %s", (f"%{keyword}%", f"%{keyword}%"))
            books = cur.fetchall()
    return response("success", "Books fetched", books)

@app.route("/books/<int:book_id>", methods=["GET"])
def get_book(book_id: int):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM books WHERE id=%s", (book_id,))
            row = cur.fetchone()
            if not row:
                return response("error", "Book not found", http_code=404)
    return response("success", "Book fetched", dict(row))

@app.route("/books", methods=["POST"])
def create_book():
    data = request.get_json(force=True)
    user, err = require_auth(data, role="librarian")
    if err: return err
    title, author = data.get("title"), data.get("author")
    description, url_image = data.get("description", ""), data.get("url_image", "")
    quantity = int(data.get("quantity", 1))
    if not title or not author:
        return response("error", "Title and author required", http_code=400)
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO books (title, author, description, url_image, quantity, available) VALUES (%s,%s,%s,%s,%s,%s)",
                (title, author, description, url_image, quantity, quantity)
            )
            conn.commit()
    return response("success", "Book created", None, 201)

@app.route("/books/<int:book_id>", methods=["PUT", "PATCH"])
def update_book(book_id: int):
    data = request.get_json(force=True)
    user, err = require_auth(data, role="librarian")
    if err: return err
    fields = {k: data.get(k) for k in ("title", "author", "description", "url_image", "quantity", "available") if k in data}
    if not fields:
        return response("error", "No fields to update", http_code=400)
    
    sets = ",".join([f"{k}=%s" for k in fields.keys()])
    values = list(fields.values()) + [book_id]
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE books SET {sets} WHERE id=%s", values)
            conn.commit()
            if cur.rowcount == 0:
                return response("error", "Book not found", http_code=404)
    return response("success", "Book updated")

@app.route("/books/<int:book_id>", methods=["DELETE"])
def delete_book(book_id: int):
    data = request.get_json(force=True)
    user, err = require_auth(data, role="librarian")
    if err: return err
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM books WHERE id=%s", (book_id,))
            conn.commit()
            if cur.rowcount == 0:
                return response("error", "Book not found", http_code=404)
    return response("success", "Book deleted")

@app.route("/borrow-requests/batch", methods=["POST"])
def create_batch_borrow_requests():
    data = request.get_json(force=True)
    user, err = require_auth(data, role=None)
    if err: return err
    
    book_ids = data.get("book_ids", [])
    if not book_ids or not isinstance(book_ids, list):
        return response("error", "book_ids là bắt buộc và phải là array", http_code=400)
    
    batch_id = str(uuid.uuid4())
    created, errors = [], []
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            for b_id in book_ids:
                try:
                    b_id = int(b_id)
                except:
                    errors.append(f"Book ID {b_id} không hợp lệ")
                    continue
                
                cur.execute("SELECT id, available, title FROM books WHERE id=%s", (b_id,))
                book_row = cur.fetchone()
                if not book_row:
                    errors.append(f"Sách ID {b_id} không tồn tại")
                    continue
                
                cur.execute(
                    "SELECT status FROM borrow_requests WHERE user_id=%s AND book_id=%s AND status IN ('submitted','approved')", 
                    (user["id"], b_id)
                )
                if cur.fetchone():
                    errors.append(f"Bạn đã có yêu cầu với sách '{book_row['title']}'")
                    continue
                
                cur.execute(
                    "INSERT INTO borrow_requests (user_id, book_id, status, batch_id) VALUES (%s,%s,'submitted',%s)",
                    (user["id"], b_id, batch_id)
                )
                created.append(book_row['title'])
            conn.commit()
            
    if not created:
        return response("error", "Không tạo được request. Lỗi: " + "; ".join(errors), http_code=400)
    
    return response("success", f"Đã tạo {len(created)} yêu cầu", {"batch_id": batch_id, "created_books": created}, 201)

@app.route("/borrow-requests", methods=["GET"])
def list_borrow_requests():
    status_filter = request.args.get("status")
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if status_filter:
                cur.execute("SELECT * FROM borrow_requests WHERE status=%s ORDER BY id DESC", (status_filter,))
            else:
                cur.execute("SELECT * FROM borrow_requests ORDER BY id DESC")
            requests_data = cur.fetchall()
    return response("success", "Borrow requests fetched", requests_data)

@app.route("/users/cart", methods=["GET"])
def get_user_cart():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Basic "):
        return response("error", "Missing credentials", http_code=401)
    
    try:
        decoded = base64.b64decode(auth_header[6:]).decode('utf-8')
        username, password = decoded.split(':', 1)
    except:
        return response("error", "Invalid credentials format", http_code=401)
    
    user = get_user(username, password)
    if not user: return response("error", "Invalid credentials", http_code=401)
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT br.*, b.title, b.author, b.url_image, b.available 
                FROM borrow_requests br 
                JOIN books b ON br.book_id = b.id 
                WHERE br.user_id=%s AND br.status='pending' 
                ORDER BY br.id DESC
            """, (user["id"],))
            cart_items = cur.fetchall()
    return response("success", "Cart fetched", cart_items)

@app.route("/users/cart/submit", methods=["POST"])
def submit_cart():
    data = request.get_json(force=True)
    user, err = require_auth(data, role=None)
    if err: return err
    batch_id = str(uuid.uuid4())
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE borrow_requests SET status='submitted', batch_id=%s WHERE user_id=%s AND status='pending'", (batch_id, user["id"]))
            rowcount = cur.rowcount
            conn.commit()
    
    if rowcount == 0: return response("error", "Giỏ mượn trống", http_code=400)
    return response("success", f"Đã gửi {rowcount} yêu cầu", {"batch_id": batch_id})

@app.route("/borrow-requests/<int:req_id>/approve", methods=["POST"])
def approve_borrow(req_id: int):
    data = request.get_json(force=True)
    user, err = require_auth(data, role="librarian")
    if err: return err
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM borrow_requests WHERE id=%s", (req_id,))
            req = cur.fetchone()
            if not req or req["status"] != "submitted":
                return response("error", "Invalid request state", http_code=400)
            
            batch_id = req["batch_id"]
            cur.execute("SELECT br.*, b.title, b.available FROM borrow_requests br JOIN books b ON br.book_id = b.id WHERE br.batch_id=%s", (batch_id,))
            batch_items = cur.fetchall()
            
            for item in batch_items:
                if item["available"] <= 0:
                    return response("error", f"Sách '{item['title']}' đã hết", http_code=400)
            
            for item in batch_items:
                cur.execute("UPDATE books SET available = available - 1 WHERE id=%s", (item["book_id"],))
                cur.execute("UPDATE borrow_requests SET status='approved' WHERE id=%s", (item["id"],))
            conn.commit()
    return response("success", "Batch approved")

@app.route("/borrow-requests/<int:req_id>/return", methods=["POST"])
def request_return(req_id: int):
    data = request.get_json(force=True)
    user, err = require_auth(data)
    if err: return err
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT batch_id FROM borrow_requests WHERE id=%s AND user_id=%s AND status='approved'", (req_id, user["id"]))
            req = cur.fetchone()
            if not req: return response("error", "Request not found", http_code=404)
            cur.execute("UPDATE borrow_requests SET status='return_requested' WHERE batch_id=%s AND status='approved'", (req["batch_id"],))
            conn.commit()
    return response("success", "Return requested")

@app.route("/borrow-requests/<int:req_id>/confirm-return", methods=["POST"])
def confirm_return(req_id: int):
    data = request.get_json(force=True)
    user, err = require_auth(data, role="librarian")
    if err: return err
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT batch_id FROM borrow_requests WHERE id=%s AND status IN ('approved', 'return_requested')", (req_id,))
            req = cur.fetchone()
            if not req: return response("error", "Invalid state", http_code=400)
            
            cur.execute("SELECT book_id, id FROM borrow_requests WHERE batch_id=%s", (req["batch_id"],))
            items = cur.fetchall()
            for item in items:
                cur.execute("UPDATE books SET available = available + 1 WHERE id=%s", (item["book_id"],))
                cur.execute("UPDATE borrow_requests SET status='returned' WHERE id=%s", (item["id"],))
            conn.commit()
    return response("success", "Return confirmed")

@app.route("/books/<int:book_id>/rating", methods=["POST"])
def rate_book(book_id: int):
    data = request.get_json(force=True)
    user, err = require_auth(data)
    if err: return err
    rating = int(data.get("rating", 0))
    comment = data.get("comment", "")
    if not (1 <= rating <= 5): return response("error", "Rating 1-5 required", http_code=400)
    
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id FROM borrow_requests WHERE book_id=%s AND user_id=%s AND status='returned' ORDER BY id DESC LIMIT 1", (book_id, user["id"]))
            req = cur.fetchone()
            if not req: return response("error", "Must return book before rating", http_code=400)
            cur.execute("INSERT INTO reviews (user_id, book_id, rating, comment) VALUES (%s,%s,%s,%s)", (user["id"], book_id, rating, comment))
            cur.execute("UPDATE borrow_requests SET rating=%s WHERE id=%s", (rating, req["id"]))
            conn.commit()
    return response("success", "Rated")

@app.route("/borrow-requests/<int:req_id>", methods=["DELETE", "OPTIONS"])
def delete_borrow_request(req_id: int):
    if request.method == "OPTIONS": return response("success", "OK")
    data = request.get_json(force=True)
    user, err = require_auth(data)
    if err: return err
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM borrow_requests WHERE id=%s", (req_id,))
            req = cur.fetchone()
            if not req: return response("error", "Not found", http_code=404)
            if user["role"] != "librarian":
                if req["user_id"] != user["id"] or req["status"] != "pending":
                    return response("error", "Forbidden", http_code=403)
            cur.execute("DELETE FROM borrow_requests WHERE id=%s", (req_id,))
            conn.commit()
    return response("success", "Deleted")

@app.route("/health", methods=["GET"])
def health_check():
    return response("success", "OK")

if __name__ == "__main__":
    init_db()
    # Dùng PORT từ Render cấp
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)