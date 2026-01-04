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
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response


@app.route('/<path:path>', methods=['OPTIONS'])
@app.route('/', methods=['OPTIONS'])
def handle_options(path=None):
    """Handle CORS preflight requests"""
    return '', 204


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
				batch_id TEXT,
				status TEXT NOT NULL CHECK(status IN ('pending','submitted','approved','return_requested','returned')),
				rating INTEGER,
				created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
		
		# Migrate existing database - thêm cột batch_id và created_at nếu chưa có
		try:
			conn.execute("SELECT batch_id FROM borrow_requests LIMIT 1")
		except sqlite3.OperationalError:
			# Cột batch_id chưa tồn tại, thêm vào
			print("⚙️  Migrating database: Adding batch_id column...")
			conn.execute("ALTER TABLE borrow_requests ADD COLUMN batch_id TEXT")
			conn.commit()
			print("✅ Added batch_id column")
		
		try:
			conn.execute("SELECT created_at FROM borrow_requests LIMIT 1")
		except sqlite3.OperationalError:
			# Cột created_at chưa tồn tại, thêm vào
			print("⚙️  Migrating database: Adding created_at column...")
			conn.execute("ALTER TABLE borrow_requests ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
			conn.commit()
			print("✅ Added created_at column")

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
    """Deprecated - Không dùng nữa, chuyển sang batch"""
    return response("error", "API này đã không dùng, hãy dùng /borrow-requests/batch", http_code=400)


# API mới: Tạo batch borrow requests từ localStorage
@app.route("/borrow-requests/batch", methods=["POST"])
def create_batch_borrow_requests():
    """Tạo batch borrow requests từ danh sách book IDs"""
    data = request.get_json(force=True)
    user, err = require_auth(data, role=None)
    if err:
        return err
    
    book_ids = data.get("book_ids", [])
    if not book_ids or not isinstance(book_ids, list):
        return response("error", "book_ids là bắt buộc và phải là array", http_code=400)
    
    import uuid
    batch_id = str(uuid.uuid4())
    
    with closing(sqlite3.connect(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        
        created = []
        errors = []
        
        for book_id in book_ids:
            try:
                book_id = int(book_id)
            except (ValueError, TypeError):
                errors.append(f"Book ID {book_id} không hợp lệ")
                continue
            
            # Kiểm tra sách có tồn tại không
            book_row = conn.execute("SELECT id, available, title FROM books WHERE id=?", (book_id,)).fetchone()
            if not book_row:
                errors.append(f"Sách ID {book_id} không tồn tại")
                continue
            
            # Kiểm tra xem có đang mượn hoặc chờ duyệt không
            active = conn.execute(
                "SELECT status FROM borrow_requests WHERE user_id=? AND book_id=? AND status IN ('submitted','approved')", 
                (user["id"], book_id)
            ).fetchone()
            
            if active:
                status_map = {'submitted': 'đang chờ duyệt', 'approved': 'đang mượn'}
                errors.append(f"Bạn {status_map.get(active['status'], 'đã có yêu cầu')} với sách '{book_row['title']}'")
                continue
            
            # Tạo request với status='submitted' và batch_id
            from datetime import datetime
            created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            conn.execute(
                "INSERT INTO borrow_requests (user_id, book_id, status, batch_id, created_at) VALUES (?,?,'submitted',?,?)",
                (user["id"], book_id, batch_id, created_at),
            )
            created.append(book_row['title'])
        
        conn.commit()
    
    if not created:
        return response("error", "Không tạo được request nào. Lỗi: " + "; ".join(errors), http_code=400)
    
    result = {
        "batch_id": batch_id,
        "created_count": len(created),
        "created_books": created
    }
    
    if errors:
        result["warnings"] = errors
    
    return response("success", f"Đã tạo {len(created)} yêu cầu mượn sách", result, 201)


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


# API mới: Lấy giỏ mượn sách của user
@app.route("/users/cart", methods=["GET"])
def get_user_cart():
	"""Lấy danh sách sách trong giỏ (status='pending') của user hiện tại"""
	auth_header = request.headers.get("Authorization", "")
	if not auth_header.startswith("Basic "):
		return response("error", "Missing credentials", http_code=401)
	
	import base64
	try:
		decoded = base64.b64decode(auth_header[6:]).decode('utf-8')
		username, password = decoded.split(':', 1)
	except:
		return response("error", "Invalid credentials format", http_code=401)
	
	user = get_user(username, password)
	if not user:
		return response("error", "Invalid credentials", http_code=401)
	
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		rows = conn.execute(
			"""SELECT br.*, b.title, b.author, b.url_image, b.available 
			   FROM borrow_requests br 
			   JOIN books b ON br.book_id = b.id 
			   WHERE br.user_id=? AND br.status='pending' 
			   ORDER BY br.id DESC""",
			(user["id"],)
		).fetchall()
		cart_items = [dict(r) for r in rows]
	
	return response("success", "Cart fetched", cart_items)


# API mới: Submit giỏ mượn (chuyển pending → submitted)
@app.route("/users/cart/submit", methods=["POST"])
def submit_cart():
	"""Submit giỏ mượn - chuyển tất cả pending requests sang submitted"""
	data = request.get_json(force=True)
	user, err = require_auth(data, role=None)
	if err:
		return err
	
	import uuid
	batch_id = str(uuid.uuid4())
	
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		
		# Lấy tất cả pending requests
		pending = conn.execute(
			"SELECT * FROM borrow_requests WHERE user_id=? AND status='pending'",
			(user["id"],)
		).fetchall()
		
		if not pending:
			return response("error", "Giỏ mượn trống", http_code=400)
		
		# Chuyển sang submitted với cùng batch_id
		conn.execute(
			"UPDATE borrow_requests SET status='submitted', batch_id=? WHERE user_id=? AND status='pending'",
			(batch_id, user["id"])
		)
		conn.commit()
	
	return response("success", f"Đã gửi yêu cầu mượn {len(pending)} sách", {"batch_id": batch_id, "count": len(pending)})


@app.route("/borrow-requests/<int:req_id>/approve", methods=["POST"])
def approve_borrow(req_id: int):
	"""Duyệt cả batch/phiếu mượn sách - validate tất cả sách trong batch"""
	data = request.get_json(force=True)
	user, err = require_auth(data, role="librarian")
	if err:
		return err
	
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		
		# Lấy request để biết batch_id
		req = conn.execute("SELECT * FROM borrow_requests WHERE id=?", (req_id,)).fetchone()
		if not req:
			return response("error", "Request not found", http_code=404)
		
		if req["status"] != "submitted":
			return response("error", "Request not submitted", http_code=400)
		
		batch_id = req["batch_id"]
		if not batch_id:
			return response("error", "Invalid batch", http_code=400)
		
		# Lấy tất cả requests trong cùng batch
		batch_requests = conn.execute(
			"SELECT * FROM borrow_requests WHERE batch_id=? AND status='submitted'",
			(batch_id,)
		).fetchall()
		
		# Validate tất cả sách trong batch
		unavailable_books = []
		for br in batch_requests:
			book = conn.execute("SELECT id, title, available FROM books WHERE id=?", (br["book_id"],)).fetchone()
			if not book or book["available"] <= 0:
				unavailable_books.append({
					"book_id": br["book_id"],
					"title": book["title"] if book else "Unknown",
					"available": book["available"] if book else 0
				})
		
		# Nếu có sách hết → Reject và báo lỗi
		if unavailable_books:
			error_msg = "Không thể duyệt phiếu mượn. Các sách sau đã hết: " + ", ".join([f"{b['title']}" for b in unavailable_books])
			return response("error", error_msg, {"unavailable": unavailable_books}, http_code=400)
		
		# Nếu OK → Approve tất cả và trừ available
		for br in batch_requests:
			conn.execute("UPDATE books SET available=available-1 WHERE id=?", (br["book_id"],))
			conn.execute("UPDATE borrow_requests SET status='approved' WHERE id=?", (br["id"],))
		
		conn.commit()
	
	return response("success", f"Đã duyệt phiếu mượn {len(batch_requests)} sách", {"count": len(batch_requests)})


@app.route("/borrow-requests/<int:req_id>/return", methods=["POST"])
def request_return(req_id: int):
	"""Yêu cầu trả sách - áp dụng cho cả batch"""
	data = request.get_json(force=True)
	user, err = require_auth(data, role=None)
	if err:
		return err

	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row  
		
		req = conn.execute("SELECT * FROM borrow_requests WHERE id=? AND user_id=?", (req_id, user["id"])).fetchone()
		
		if not req:
			return response("error", "Request not found for user", http_code=404)
		
		if req["status"] != "approved":
			return response("error", "Cannot request return for this state", http_code=400)
		
		batch_id = req["batch_id"]
		if not batch_id:
			return response("error", "Invalid batch", http_code=400)
		
		# Chuyển tất cả sách trong batch sang return_requested
		result = conn.execute(
			"UPDATE borrow_requests SET status='return_requested' WHERE batch_id=? AND status='approved'",
			(batch_id,)
		)
		conn.commit()
		
	return response("success", f"Đã gửi yêu cầu trả {result.rowcount} sách trong phiếu", {"count": result.rowcount})

@app.route("/borrow-requests/<int:req_id>/confirm-return", methods=["POST"])
def confirm_return(req_id: int):
	"""Xác nhận trả sách - áp dụng cho cả batch"""
	data = request.get_json(force=True)
	user, err = require_auth(data, role="librarian")
	if err:
		return err
	
	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		
		req = conn.execute("SELECT * FROM borrow_requests WHERE id=?", (req_id,)).fetchone()
		if not req:
			return response("error", "Request not found", http_code=404)
		
		if req["status"] not in ("approved", "return_requested"):
			return response("error", "Invalid state for return", http_code=400)
		
		batch_id = req["batch_id"]
		if not batch_id:
			return response("error", "Invalid batch", http_code=400)
		
		# Lấy tất cả requests trong batch
		batch_requests = conn.execute(
			"SELECT * FROM borrow_requests WHERE batch_id=? AND status IN ('approved', 'return_requested')",
			(batch_id,)
		).fetchall()
		
		# Trả tất cả sách trong batch
		for br in batch_requests:
			conn.execute("UPDATE books SET available=available+1 WHERE id=?", (br["book_id"],))
			conn.execute("UPDATE borrow_requests SET status='returned' WHERE id=?", (br["id"],))
		
		conn.commit()
	
	return response("success", f"Đã xác nhận trả {len(batch_requests)} sách trong phiếu", {"count": len(batch_requests)})

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

@app.route("/borrow-requests/<int:req_id>", methods=["DELETE", "OPTIONS"])
def delete_borrow_request(req_id: int):
	"""Xóa sách khỏi giỏ hoặc xóa request (librarian)"""
	if request.method == "OPTIONS":
		return response("success", "OK")

	try:
		data = request.get_json(force=True)
	except:
		return response("error", "Invalid JSON body", http_code=400)

	user, err = require_auth(data, role=None)
	if err:
		return err

	with closing(sqlite3.connect(DB_PATH)) as conn:
		conn.row_factory = sqlite3.Row
		
		req = conn.execute("SELECT * FROM borrow_requests WHERE id=?", (req_id,)).fetchone()
		if not req:
			return response("error", "Request not found", http_code=404)
		
		# User chỉ có thể xóa request của mình và chỉ khi status='pending' (trong giỏ)
		if user["role"] != "librarian":
			if req["user_id"] != user["id"]:
				return response("error", "Forbidden", http_code=403)
			if req["status"] != "pending":
				return response("error", "Chỉ có thể xóa sách trong giỏ mượn", http_code=400)
		
		conn.execute("DELETE FROM borrow_requests WHERE id=?", (req_id,))
		conn.commit()

	return response("success", "Đã xóa thành công")

if __name__ == "__main__":
	init_db()
	app.run(host="0.0.0.0", port=5000, debug=False)
