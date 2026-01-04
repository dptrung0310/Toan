import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import Layout from "../../components/Layout";
import { api } from "../../lib/api";
import styles from "../../styles/History.module.css";

export default function BorrowHistory() {
  const { user } = useAuth();
  const router = useRouter();
  const [batches, setBatches] = useState([]);
  const [books, setBooks] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    if (user && !user.id) {
      alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      router.push("/auth/login");
      return;
    }

    if (user.id) {
      loadHistory();
    }
  }, [user]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const result = await api.listBorrowRequests();

      if (result.ok && result.data?.status === "success") {
        const allRequests = result.data.data || [];

        // Chỉ lấy request của user hiện tại
        const userRequests = allRequests.filter(
          (req) => req.user_id === user.id
        );

        // Group theo batch_id
        const batchMap = {};
        userRequests.forEach((req) => {
          const batchId = req.batch_id || `single_${req.id}`;
          if (!batchMap[batchId]) {
            batchMap[batchId] = {
              id: batchId,
              requests: [],
              status: req.status,
              created_at: req.created_at,
            };
          }
          batchMap[batchId].requests.push(req);
          // Cập nhật status (ưu tiên status cao nhất)
          if (req.status === "return_requested") batchMap[batchId].status = "return_requested";
          else if (req.status === "approved" && batchMap[batchId].status !== "return_requested") {
            batchMap[batchId].status = "approved";
          }
        });

        const batchList = Object.values(batchMap).sort((a, b) => {
          return new Date(b.created_at) - new Date(a.created_at);
        });

        setBatches(batchList);

        // Load thông tin chi tiết từng cuốn sách
        const bookIds = [...new Set(userRequests.map((req) => req.book_id))];
        const bookData = {};
        for (const id of bookIds) {
          const bookResult = await api.getBook(id);
          if (bookResult.ok && bookResult.data?.status === "success") {
            bookData[id] = bookResult.data.data;
          }
        }
        setBooks(bookData);
      }
    } catch (err) {
      console.error("Lỗi khi tải lịch sử:", err);
    }
    setLoading(false);
  };

  const handleReturn = async (batchId) => {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch || batch.status !== "approved") return;

    if (!confirm(`Bạn có chắc muốn yêu cầu trả ${batch.requests.length} sách trong phiếu này?`)) {
      return;
    }

    setReturning(true);
    setError("");

    // Gọi API với request ID đầu tiên trong batch
    const firstReqId = batch.requests[0].id;
    const result = await api.requestReturn(
      { username: user.username, password: user.password },
      firstReqId
    );
    setReturning(false);

    if (result.ok && result.data?.status === "success") {
      alert("Đã gửi yêu cầu trả sách!");
      loadHistory();
      setSelectedBatch(null);
    } else {
      setError(result.data?.message || "Không thể gửi yêu cầu trả sách");
    }
  };

  const getStatusText = (status) => {
    const statusMap = {
      pending: "Chờ xử lý",
      submitted: "Chờ duyệt",
      approved: "Đang mượn",
      return_requested: "Chờ xác nhận trả",
      returned: "Đã trả",
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status) => {
    const colorMap = {
      pending: "#f59e0b",
      submitted: "#f59e0b",
      approved: "#10b981",
      return_requested: "#3b82f6",
      returned: "#6b7280",
    };
    return colorMap[status] || "#6b7280";
  };

  return (
    <Layout>
      <div className={styles.historyPage}>
        <div className={styles.leftPanel}>
          <h2>Lịch sử mượn sách</h2>

          <div className={styles.batchList}>
            {loading && <div className={styles.loading}>Đang tải...</div>}

            {!loading && batches.length === 0 && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📋</div>
                <div>Chưa có lịch sử mượn sách</div>
              </div>
            )}

            {batches.map((batch) => (
              <div
                key={batch.id}
                className={`${styles.batchCard} ${
                  selectedBatch?.id === batch.id ? styles.active : ""
                }`}
                onClick={() => setSelectedBatch(batch)}
              >
                <div className={styles.batchHeader}>
                  <div className={styles.batchInfo}>
                    <div className={styles.batchTitle}>
                      Phiếu #{batch.id.substring(0, 8)}
                    </div>
                    <div className={styles.batchMeta}>
                      {batch.requests.length} sách
                    </div>
                  </div>
                  <span
                    className={styles.statusBadge}
                    style={{ background: getStatusColor(batch.status) }}
                  >
                    {getStatusText(batch.status)}
                  </span>
                </div>
                <div className={styles.batchBooks}>
                  {batch.requests.map((req) => {
                    const book = books[req.book_id];
                    return (
                      <div key={req.id} className={styles.bookItem}>
                        {book ? book.title : `Book ID: ${req.book_id}`}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.rightPanel}>
          {!selectedBatch && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>👈</div>
              <div>Chọn một phiếu mượn từ danh sách bên trái</div>
            </div>
          )}

          {selectedBatch && (
            <>
              <div className={styles.batchDetail}>
                {error && <div className={styles.error}>{error}</div>}
                
                <h1 className={styles.detailTitle}>
                  Phiếu mượn #{selectedBatch.id.substring(0, 8)}
                </h1>
                
                <div className={styles.detailSection}>
                  <h3>Trạng thái</h3>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      background: getStatusColor(selectedBatch.status),
                      color: "white",
                      fontWeight: 500,
                    }}
                  >
                    {getStatusText(selectedBatch.status)}
                  </div>
                </div>

                <div className={styles.detailSection}>
                  <h3>Danh sách sách ({selectedBatch.requests.length})</h3>
                  <div className={styles.booksList}>
                    {selectedBatch.requests.map((req) => {
                      const book = books[req.book_id];
                      if (!book) return null;

                      return (
                        <div key={req.id} className={styles.bookCard}>
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
                            <div className={styles.bookAuthor}>
                              Tác giả: {book.author}
                            </div>
                            <div className={styles.bookMeta}>
                              <span className={styles.bookBadge}>
                                Book ID: {book.id}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.detailSection}>
                  <h3>Thông tin phiếu</h3>
                  <div className={styles.detailStats}>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Batch ID</span>
                      <span className={styles.statValue}>
                        {selectedBatch.id}
                      </span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Số lượng sách</span>
                      <span className={styles.statValue}>
                        {selectedBatch.requests.length}
                      </span>
                    </div>
                    {selectedBatch.created_at && (
                      <div className={styles.statItem}>
                        <span className={styles.statLabel}>Ngày tạo</span>
                        <span className={styles.statValue}>
                          {new Date(selectedBatch.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.detailActions}>
                {selectedBatch.status === "approved" && (
                  <button
                    onClick={() => handleReturn(selectedBatch.id)}
                    disabled={returning}
                  >
                    {returning ? "Đang xử lý..." : "Yêu cầu trả sách"}
                  </button>
                )}
                {selectedBatch.status === "submitted" && (
                  <button disabled>Đang chờ duyệt</button>
                )}
                {selectedBatch.status === "return_requested" && (
                  <button disabled>Đang chờ xác nhận trả</button>
                )}
                {selectedBatch.status === "returned" && (
                  <button disabled>Đã trả sách</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
