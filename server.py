import sqlite3
from contextlib import closing
from typing import Any, Dict, Optional, Tuple

from flask import Flask, jsonify, request


app = Flask(__name__)
DB_PATH = "library.db"


@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response


def response(status: str, message: str, data: Any = None, http_code: int = 200):
	payload = {"status": status, "message": message, "data": data}
	return jsonify(payload), http_code


def init_db():
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.execute(
			"""
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				username TEXT UNIQUE NOT NULL,
				password TEXT NOT NULL,
				role TEXT NOT NULL CHECK(role IN ('user','librarian'))
			);
			"""
		)
		conn.execute(
			"""
			CREATE TABLE IF NOT EXISTS books (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				title TEXT NOT NULL,
				author TEXT NOT NULL,
				description TEXT DEFAULT '',
				url_image TEXT DEFAULT '',
				quantity INTEGER NOT NULL DEFAULT 1,
				available INTEGER NOT NULL DEFAULT 1
			);
			"""
		)
		conn.execute(
			"""
			CREATE TABLE IF NOT EXISTS borrow_requests (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				book_id INTEGER NOT NULL,
				status TEXT NOT NULL CHECK(status IN ('pending','approved','return_requested','returned')),
				rating INTEGER,
				FOREIGN KEY(user_id) REFERENCES users(id),
				FOREIGN KEY(book_id) REFERENCES books(id)
			);
			"""
		)
		conn.execute(
			"""
			CREATE TABLE IF NOT EXISTS reviews (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				book_id INTEGER NOT NULL,
				rating INTEGER NOT NULL,
				comment TEXT DEFAULT '',
				FOREIGN KEY(user_id) REFERENCES users(id),
				FOREIGN KEY(book_id) REFERENCES books(id)
			);
			"""
		)
		conn.commit()

		# Insert sample data if tables are empty
		if not conn.execute("SELECT 1 FROM users LIMIT 1").fetchone():
			conn.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ("user1", "pass1", "user"))
			conn.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ("librarian1", "pass1", "librarian"))
		if not conn.execute("SELECT 1 FROM books LIMIT 1").fetchone():
			conn.execute(
				"INSERT INTO books (title, author, description, url_image, quantity, available) VALUES (?, ?, ?, ?, ?, ?)",
				("Book One", "Author A", "A great book", "https://picsum.photos/seed/book1/400/600", 5, 5),
			)
			conn.execute(
				"INSERT INTO books (title, author, description, url_image, quantity, available) VALUES (?, ?, ?, ?, ?, ?)",
				("Book Two", "Author B", "Another book", "https://picsum.photos/seed/book2/400/600", 3, 3),
			)
		conn.commit()


def get_user(username: str, password: str) -> Optional[Dict[str, Any]]:
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		user = conn.execute(
			"SELECT * FROM users WHERE username=? AND password=?", (username, password)
		).fetchone()
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
	username = data.get("username")
	password = data.get("password")
	role = data.get("role", "user")
	if role not in ("user", "librarian"):
		return response("error", "Role must be user or librarian", http_code=400)
	if not username or not password:
		return response("error", "Username and password required", http_code=400)
	try:
		with closing(sqlite3.connect(DB_PATH)) as conn:
			conn.execute(
				"INSERT INTO users (username, password, role) VALUES (?,?,?)",
				(username, password, role),
			)
			conn.commit()
		return response("success", "User registered", {"username": username, "role": role}, 201)
	except sqlite3.IntegrityError:
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
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		rows = conn.execute(
			"SELECT * FROM books WHERE lower(title) LIKE ? OR lower(author) LIKE ?",
			(f"%{keyword}%", f"%{keyword}%"),
		).fetchall()
		books = [dict(r) for r in rows]
	return response("success", "Books fetched", books)


@app.route("/books/<int:book_id>", methods=["GET"])
def get_book(book_id: int):
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		row = conn.execute("SELECT * FROM books WHERE id=?", (book_id,)).fetchone()
		if not row:
			return response("error", "Book not found", http_code=404)
	return response("success", "Book fetched", dict(row))


@app.route("/books", methods=["POST"])
def create_book():
	data = request.get_json(force=True)
	user, err = require_auth(data, role="librarian")
	if err:
		return err
	title = data.get("title")
	author = data.get("author")
	description = data.get("description", "")
	url_image = data.get("url_image", "")
	quantity = int(data.get("quantity", 1))
	if not title or not author:
		return response("error", "Title and author required", http_code=400)
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.execute(
			"INSERT INTO books (title, author, description, url_image, quantity, available) VALUES (?,?,?,?,?,?)",
			(title, author, description, url_image, quantity, quantity),
		)
		conn.commit()
	return response("success", "Book created", None, 201)


@app.route("/books/<int:book_id>", methods=["PUT", "PATCH"])
def update_book(book_id: int):
	data = request.get_json(force=True)
	user, err = require_auth(data, role="librarian")
	if err:
		return err
	fields = {k: data.get(k) for k in ("title", "author", "description", "url_image", "quantity", "available") if k in data}
	if not fields:
		return response("error", "No fields to update", http_code=400)
	sets = ",".join(f"{k}=?" for k in fields)
	values = list(fields.values()) + [book_id]
	with closing(sqlite3.connect(DB_PATH)) as conn:
		cur = conn.execute(f"UPDATE books SET {sets} WHERE id=?", values)
		conn.commit()
		if cur.rowcount == 0:
			return response("error", "Book not found", http_code=404)
	return response("success", "Book updated")


@app.route("/books/<int:book_id>", methods=["DELETE"])
def delete_book(book_id: int):
	data = request.get_json(force=True)
	user, err = require_auth(data, role="librarian")
	if err:
		return err
	with closing(sqlite3.connect(DB_PATH)) as conn:
		cur = conn.execute("DELETE FROM books WHERE id=?", (book_id,))
		conn.commit()
		if cur.rowcount == 0:
			return response("error", "Book not found", http_code=404)
	return response("success", "Book deleted")


@app.route("/borrow-requests", methods=["POST"])
def create_borrow_request():
    # 1. Lấy dữ liệu và xác thực
    data = request.get_json(force=True)
    user, err = require_auth(data, role=None)
    if err:
        return err
    
    # 2. Chuyển đổi book_id sang số nguyên (quan trọng để query chính xác)
    try:
        book_id = int(data.get("book_id"))
    except (ValueError, TypeError):
        return response("error", "Book ID không hợp lệ", http_code=400)

    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row # Để lấy dữ liệu dạng dictionary

        # 3. Kiểm tra sách có tồn tại và còn hàng không
        book_row = conn.execute("SELECT id, available, title FROM books WHERE id=?", (book_id,)).fetchone()
        if not book_row:
            return response("error", "Sách không tồn tại", http_code=404)
        
        # --- LOGIC QUAN TRỌNG NHẤT Ở ĐÂY ---
        # 4. Kiểm tra xem User ID này đã từng có dòng nào với Book ID này chưa
        # Bất kể status là 'pending', 'approved', 'returned' hay 'return_requested' đều chặn.
        existing_req = conn.execute(
            "SELECT status FROM borrow_requests WHERE user_id=? AND book_id=?", 
            (user["id"], book_id)
        ).fetchone()
        
        if existing_req:
            # Nếu tìm thấy dữ liệu -> Báo lỗi ngay
            status_text = existing_req['status']
            msg = f"Bạn không thể mượn lại. Sách này đang ở trạng thái: {status_text}"
            return response("error", msg, http_code=400)
        # -----------------------------------

        # 5. Kiểm tra số lượng tồn kho
        if book_row["available"] <= 0:
            return response("error", "Sách này hiện đã hết hàng", http_code=400)

        # 6. Nếu mọi thứ OK -> Tạo yêu cầu
        conn.execute(
            "INSERT INTO borrow_requests (user_id, book_id, status) VALUES (?,?, 'pending')",
            (user["id"], book_id),
        )
        conn.commit()

    return response("success", "Gửi yêu cầu mượn thành công", None, 201)

@app.route("/borrow-requests", methods=["GET"])
def list_borrow_requests():
	status_filter = request.args.get("status")
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		if status_filter:
			rows = conn.execute(
				"SELECT * FROM borrow_requests WHERE status=? ORDER BY id DESC",
				(status_filter,),
			).fetchall()
		else:
			rows = conn.execute(
				"SELECT * FROM borrow_requests ORDER BY id DESC"
			).fetchall()
		requests_data = [dict(r) for r in rows]
	return response("success", "Borrow requests fetched", requests_data)


@app.route("/borrow-requests/<int:req_id>/approve", methods=["POST"])
def approve_borrow(req_id: int):
	data = request.get_json(force=True)
	user, err = require_auth(data, role="librarian")
	if err:
		return err
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		req = conn.execute("SELECT * FROM borrow_requests WHERE id=?", (req_id,)).fetchone()
		if not req:
			return response("error", "Request not found", http_code=404)
		if req["status"] != "pending":
			return response("error", "Request not pending", http_code=400)
		book = conn.execute("SELECT available FROM books WHERE id=?", (req["book_id"],)).fetchone()
		if not book or book["available"] <= 0:
			return response("error", "Book unavailable", http_code=400)
		conn.execute("UPDATE books SET available=available-1 WHERE id=?", (req["book_id"],))
		conn.execute("UPDATE borrow_requests SET status='approved' WHERE id=?", (req_id,))
		conn.commit()
	return response("success", "Request approved")


@app.route("/borrow-requests/<int:req_id>/return", methods=["POST"])
def request_return(req_id: int):
    data = request.get_json(force=True)
    user, err = require_auth(data, role=None)
    if err:
        return err

    with closing(sqlite3.connect(DB_PATH)) as conn:
        # --- THÊM DÒNG QUAN TRỌNG NÀY ---
        conn.row_factory = sqlite3.Row  
        # --------------------------------
        
        req = conn.execute("SELECT * FROM borrow_requests WHERE id=? AND user_id=?", (req_id, user["id"])).fetchone()
        
        if not req:
            return response("error", "Request not found for user", http_code=404)
        
        # Lỗi 500 xảy ra tại dòng dưới đây nếu thiếu dòng 'row_factory' ở trên
        if req["status"] != "approved":
            return response("error", "Cannot mark return for this state", http_code=400)
            
        conn.execute("UPDATE borrow_requests SET status='return_requested' WHERE id=?", (req_id,))
        conn.commit()
        
    return response("success", "Return requested")

@app.route("/borrow-requests/<int:req_id>/confirm-return", methods=["POST"])
def confirm_return(req_id: int):
    data = request.get_json(force=True)
    user, err = require_auth(data, role="librarian")
    if err:
        return err
    with closing(sqlite3.connect(DB_PATH)) as conn:
        # --- THÊM DÒNG NÀY ---
        conn.row_factory = sqlite3.Row
        # ---------------------
        
        req = conn.execute("SELECT * FROM borrow_requests WHERE id=?", (req_id,)).fetchone()
        if not req:
            return response("error", "Request not found", http_code=404)
        if req["status"] not in ("approved", "return_requested"):
            return response("error", "Invalid state for return", http_code=400)
            
        conn.execute("UPDATE books SET available=available+1 WHERE id=?", (req["book_id"],))
        conn.execute("UPDATE borrow_requests SET status='returned' WHERE id=?", (req_id,))
        conn.commit()
    return response("success", "Return confirmed")

@app.route("/books/<int:book_id>/rating", methods=["POST"])
def rate_book(book_id: int):
	data = request.get_json(force=True)
	user, err = require_auth(data, role=None)
	if err:
		return err
	rating = data.get("rating")
	comment = data.get("comment", "")
	if rating is None or not (1 <= int(rating) <= 5):
		return response("error", "Rating must be 1-5", http_code=400)
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		req = conn.execute(
			"""
			SELECT id FROM borrow_requests
			WHERE book_id=? AND user_id=? AND status='returned'
			ORDER BY id DESC LIMIT 1
			""",
			(book_id, user["id"]),
		).fetchone()
		if not req:
			return response("error", "Rate after returning this book", http_code=400)
		conn.execute(
			"INSERT INTO reviews (user_id, book_id, rating, comment) VALUES (?,?,?,?)",
			(user["id"], book_id, int(rating), comment),
		)
		conn.execute(
			"UPDATE borrow_requests SET rating=? WHERE id=?",
			(int(rating), req["id"]),
		)
		conn.commit()
	return response("success", "Rated", {"book_id": book_id, "rating": int(rating), "comment": comment})


@app.route("/health", methods=["GET"])
def health_check():
	return response("success", "OK")

# --- SỬA LẠI ĐOẠN NÀY ---
# --- SỬA LẠI HÀM NÀY TRONG SERVER.PY ---

@app.route("/borrow-requests/<int:req_id>", methods=["DELETE", "OPTIONS"]) # 1. Thêm phương thức OPTIONS
def delete_borrow_request(req_id: int):
    # 2. Nếu trình duyệt gửi lệnh thăm dò (OPTIONS), trả về OK ngay lập tức
    # (Đừng cố đọc JSON ở bước này vì body nó rỗng)
    if request.method == "OPTIONS":
        return response("success", "OK")

    # 3. Code xử lý xóa thật (chỉ chạy khi method là DELETE)
    # Lúc này mới đọc JSON
    try:
        data = request.get_json(force=True)
    except:
        return response("error", "Invalid JSON body", http_code=400)

    # Xác thực quyền Admin
    user, err = require_auth(data, role="librarian")
    if err:
        return err

    with closing(sqlite3.connect(DB_PATH)) as conn:
        # Kiểm tra xem yêu cầu có tồn tại không
        req = conn.execute("SELECT * FROM borrow_requests WHERE id=?", (req_id,)).fetchone()
        if not req:
            return response("error", "Request not found", http_code=404)
        
        # Thực hiện xóa
        conn.execute("DELETE FROM borrow_requests WHERE id=?", (req_id,))
        conn.commit()

    return response("success", "Đã xóa yêu cầu mượn sách thành công")

if __name__ == "__main__":
	init_db()
	app.run(host="0.0.0.0", port=5000, debug=False)
