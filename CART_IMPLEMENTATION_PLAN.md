# Cart-Based Borrowing Implementation Plan

## Yêu cầu
1. User có 1 giỏ mượn sách (cart), có thể thêm nhiều sách
2. Các sách chưa được duyệt vẫn nằm trong giỏ, có thể thêm tiếp
3. Librarian duyệt cả giỏ một lần
4. Nếu có sách hết → Reject toàn bộ và báo lỗi chi tiết sách nào hết
5. User có thể xóa sách khỏi giỏ trước khi submit lại

## Thay đổi Backend (server.py)

### 1. Thay đổi logic create_borrow_request
- Cho phép user thêm nhiều sách (bỏ check existing request)
- Chỉ tạo requests với status='pending'  (= trong giỏ)

### 2. Thêm API mới: GET /users/{user_id}/cart
- Lấy tất cả requests status='pending' của user đó
- Return danh sách sách trong giỏ với thông tin chi tiết

### 3. Thay đổi approve_borrow
- Thay vì duyệt từng request riêng lẻ
- Thêm API: POST /users/{user_id}/cart/submit
- Librarian duyệt toàn bộ giỏ:
  - Validate tất cả sách còn hàng không
  - Nếu có sách hết → return error với danh sách sách hết
  - Nếu OK → approve tất cả cùng lúc, trừ available

### 4. API xóa sách khỏi giỏ: DELETE /borrow-requests/{id}
- User có thể xóa sách khỏi giỏ (nếu status='pending')

## Thay đổi Frontend

### 1. Trang User Dashboard
- Thêm icon/button "Giỏ mượn" hiển thị số sách trong giỏ
- Click nút "Mượn sách" → Thêm vào giỏ (không submit ngay)
- Hiển thị notification "Đã thêm vào giỏ"

### 2. Trang Cart (mới tạo): /user/cart
- Hiển thị danh sách sách trong giỏ
- Mỗi sách có nút "Xóa" để bỏ ra khỏi giỏ
- Nút "Submit giỏ mượn" → Gửi yêu cầu cho librarian
- Hiển thị lỗi nếu có sách hết

### 3. Trang Librarian Requests
- Hiển thị requests theo user
- Khi duyệt → Duyệt toàn bộ giỏ của user đó
- Nếu có lỗi → Hiển thị sách nào hết để librarian thông báo cho user

## Migration Steps
1. Update server.py backend APIs
2. Update frontend API calls
3. Create Cart page
4. Update User dashboard to use cart
5. Update Librarian requests page
