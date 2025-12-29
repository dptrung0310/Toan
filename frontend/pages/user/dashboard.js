import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import Layout from "../../components/Layout";
import { api } from "../../lib/api";
import styles from "../../styles/Dashboard.module.css";

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [borrowing, setBorrowing] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }
    loadBooks();
  }, [user]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = books.filter(
        (book) =>
          book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          book.author.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredBooks(filtered.slice(0, 5));
    } else {
      setFilteredBooks(books);
    }
  }, [searchQuery, books]);

  const loadBooks = async () => {
    setLoading(true);
    const result = await api.searchBooks();
    setLoading(false);

    if (result.ok && result.data?.status === "success") {
      setBooks(result.data.data || []);
      setFilteredBooks(result.data.data || []);
    } else {
      setError("Không thể tải danh sách sách");
    }
  };

  const handleBorrow = async () => {
    // Kiểm tra cơ bản
    if (!selectedBook) return;
    if (!user || !user.id) {
      alert("Vui lòng đăng nhập lại để thực hiện chức năng này.");
      router.push("/auth/login");
      return;
    }

    setBorrowing(true);
    setError("");

    try {
      // Gọi API
      const result = await api.createBorrowRequest(
        { username: user.username, password: user.password },
        selectedBook.id
      );

      setBorrowing(false);

      // --- XỬ LÝ KẾT QUẢ ---
      if (result.ok && result.data?.status === "success") {
        // Trường hợp THÀNH CÔNG
        alert("✅ Đã gửi yêu cầu mượn sách thành công!");
        loadBooks(); // Load lại để cập nhật số lượng sách
      } else {
        // Trường hợp THẤT BẠI (Đã mượn rồi hoặc hết sách)
        // Lấy tin nhắn lỗi chính xác từ Server gửi về
        const serverMsg = result.data?.message || "Có lỗi xảy ra";

        // Hiện Popup thông báo ngay lập tức
        alert(`⚠️ KHÔNG THỂ MƯỢN:\n${serverMsg}`);

        // Set error state để hiện chữ đỏ (nếu cần)
        setError(serverMsg);
      }
    } catch (err) {
      setBorrowing(false);
      alert("Lỗi kết nối đến server!");
      console.error(err);
    }
  };

  return (
    <Layout>
      <div className={styles.dashboard}>
        <div className={styles.leftPanel}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Tìm kiếm sách theo tên hoặc tác giả..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.bookList}>
            {loading && <div className={styles.loading}>Đang tải...</div>}
            {!loading && filteredBooks.length === 0 && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📚</div>
                <div>Không tìm thấy sách nào</div>
              </div>
            )}
            {filteredBooks.map((book) => (
              <div
                key={book.id}
                className={`${styles.bookCard} ${
                  selectedBook?.id === book.id ? styles.active : ""
                }`}
                onClick={() => setSelectedBook(book)}
              >
                <img
                  src={
                    book.url_image ||
                    "https://picsum.photos/seed/default/400/600"
                  }
                  alt={book.title}
                  className={styles.bookCover}
                />
                <div className={styles.bookInfo}>
                  <div className={styles.bookTitle}>{book.title}</div>
                  <div className={styles.bookAuthor}>{book.author}</div>
                  <div className={styles.bookMeta}>
                    <span
                      className={`${styles.bookBadge} ${
                        book.available > 0 ? styles.available : ""
                      }`}
                    >
                      {book.available > 0
                        ? `Còn ${book.available}`
                        : "Hết sách"}
                    </span>
                    <span className={styles.bookBadge}>ID: {book.id}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.rightPanel}>
          {!selectedBook && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>👈</div>
              <div>Chọn một cuốn sách từ danh sách bên trái</div>
            </div>
          )}

          {selectedBook && (
            <>
              {error && <div className={styles.error}>{error}</div>}
              <img
                src={
                  selectedBook.url_image ||
                  "https://picsum.photos/seed/default/400/600"
                }
                alt={selectedBook.title}
                className={styles.detailCover}
              />
              <h1 className={styles.detailTitle}>{selectedBook.title}</h1>
              <div className={styles.detailAuthor}>
                Tác giả: {selectedBook.author}
              </div>

              <div className={styles.detailSection}>
                <h3>Mô tả</h3>
                <p className={styles.detailDescription}>
                  {selectedBook.description || "Chưa có mô tả"}
                </p>
              </div>

              <div className={styles.detailSection}>
                <h3>Thông tin</h3>
                <div className={styles.detailStats}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Tổng số</span>
                    <span className={styles.statValue}>
                      {selectedBook.quantity}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Còn lại</span>
                    <span className={styles.statValue}>
                      {selectedBook.available}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Book ID</span>
                    <span className={styles.statValue}>{selectedBook.id}</span>
                  </div>
                </div>
              </div>

              <div className={styles.detailActions}>
                <button
                  onClick={handleBorrow}
                  disabled={borrowing || selectedBook.available === 0}
                >
                  {borrowing ? "Đang xử lý..." : "Mượn sách"}
                </button>
                <Link href={`/books/${selectedBook.id}`}>
                  <button className={styles.btnSecondary}>Xem chi tiết</button>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
