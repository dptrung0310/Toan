import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import Layout from "../../components/Layout";
import { api } from "../../lib/api";
import styles from "../../styles/Requests.module.css";

export default function Requests() {
  const { user } = useAuth();
  const router = useRouter();

  const [borrowRequests, setBorrowRequests] = useState([]);
  const [returnRequests, setReturnRequests] = useState([]);
  const [selectedBorrow, setSelectedBorrow] = useState(null);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [books, setBooks] = useState({});
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "librarian") {
      router.push("/auth/login");
      return;
    }
    loadRequests();
  }, [user]);

  const loadRequests = async () => {
    setLoading(true);
    const result = await api.listBorrowRequests();

    if (result.ok && result.data?.status === "success") {
      const allRequests = result.data.data || [];

      const pending = allRequests.filter((req) => req.status === "pending");
      const returning = allRequests.filter(
        (req) => req.status === "return_requested" || req.status === "approved"
      );

      setBorrowRequests(pending);
      setReturnRequests(returning);

      // Load book details
      const bookIds = [...new Set(allRequests.map((req) => req.book_id))];
      const bookData = {};
      for (const id of bookIds) {
        const bookResult = await api.getBook(id);
        if (bookResult.ok && bookResult.data?.status === "success") {
          bookData[id] = bookResult.data.data;
        }
      }
      setBooks(bookData);

      // Mock user data (in real app, would fetch from API)
      const userData = {};
      allRequests.forEach((req) => {
        userData[req.user_id] = `User ${req.user_id}`;
      });
      setUsers(userData);
    }

    setLoading(false);
  };

  const handleApproveBorrow = async () => {
    if (!selectedBorrow) return;
    setProcessing(true);
    setMessage({ type: "", text: "" });

    const result = await api.approveBorrow(
      { username: user.username, password: user.password },
      selectedBorrow.id
    );
    setProcessing(false);

    if (result.ok && result.data?.status === "success") {
      setMessage({ type: "success", text: "Đã phê duyệt yêu cầu mượn sách!" });
      setSelectedBorrow(null);
      setTimeout(() => {
        setMessage({ type: "", text: "" });
        loadRequests();
      }, 1500);
    } else {
      setMessage({
        type: "error",
        text: result.data?.message || "Không thể phê duyệt",
      });
    }
  };

  // --- HÀM XỬ LÝ XÓA MỚI ---
  const handleDeleteBorrow = async () => {
    if (!selectedBorrow) return;

    // Hỏi xác nhận trước khi xóa
    if (
      !confirm(
        `Bạn có chắc chắn muốn xóa/từ chối yêu cầu #${selectedBorrow.id} không?`
      )
    ) {
      return;
    }

    setProcessing(true);
    setMessage({ type: "", text: "" });

    // Gọi API xóa (Lưu ý: Bạn cần đảm bảo file api.js đã có hàm deleteBorrowRequest)
    // Nếu chưa có, bạn cần thêm vào file api.js tương tự như các hàm khác
    const result = await api.deleteBorrowRequest(
      { username: user.username, password: user.password },
      selectedBorrow.id
    );

    setProcessing(false);

    if (result.ok && result.data?.status === "success") {
      setMessage({ type: "success", text: "Đã xóa yêu cầu thành công!" });
      setSelectedBorrow(null);
      setTimeout(() => {
        setMessage({ type: "", text: "" });
        loadRequests();
      }, 1500);
    } else {
      setMessage({
        type: "error",
        text: result.data?.message || "Không thể xóa yêu cầu",
      });
    }
  };
  // --------------------------

  const handleConfirmReturn = async () => {
    if (!selectedReturn) return;
    setProcessing(true);
    setMessage({ type: "", text: "" });

    const result = await api.confirmReturn(
      { username: user.username, password: user.password },
      selectedReturn.id
    );
    setProcessing(false);

    if (result.ok && result.data?.status === "success") {
      setMessage({ type: "success", text: "Đã xác nhận trả sách!" });
      setSelectedReturn(null);
      setTimeout(() => {
        setMessage({ type: "", text: "" });
        loadRequests();
      }, 1500);
    } else {
      setMessage({
        type: "error",
        text: result.data?.message || "Không thể xác nhận trả",
      });
    }
  };

  const getStatusBadgeClass = (status) => {
    const map = {
      pending: styles.pending,
      approved: styles.approved,
      return_requested: styles.returnRequested,
    };
    return `${styles.requestBadge} ${map[status] || ""}`;
  };

  const getStatusText = (status) => {
    const map = {
      pending: "Chờ duyệt",
      approved: "Đã duyệt",
      return_requested: "Yêu cầu trả",
      returned: "Đã trả",
    };
    return map[status] || status;
  };

  if (loading) {
    return (
      <Layout>
        <div className={styles.loading}>Đang tải...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={styles.requestsPage}>
        <h1 className={styles.pageTitle}>Quản lý yêu cầu mượn/trả sách</h1>

        {message.text && (
          <div className={`${styles.message} ${styles[message.type]}`}>
            {message.text}
          </div>
        )}

        <div className={styles.requestsGrid}>
          {/* Left panel: Borrow requests */}
          <div className={styles.requestPanel}>
            <div className={styles.panelHeader}>
              <h2>Yêu cầu mượn sách</h2>
              <p>Phê duyệt các yêu cầu mượn sách từ người dùng</p>
            </div>

            <div className={styles.requestList}>
              {borrowRequests.length === 0 && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📚</div>
                  <div>Không có yêu cầu mượn nào</div>
                </div>
              )}

              {borrowRequests.map((request) => {
                const book = books[request.book_id];
                return (
                  <div
                    key={request.id}
                    className={`${styles.requestCard} ${
                      selectedBorrow?.id === request.id ? styles.selected : ""
                    }`}
                    onClick={() => setSelectedBorrow(request)}
                  >
                    <div className={styles.requestCardHeader}>
                      <span className={styles.requestId}>
                        Request #{request.id}
                      </span>
                      <span className={getStatusBadgeClass(request.status)}>
                        {getStatusText(request.status)}
                      </span>
                    </div>
                    <div className={styles.requestInfo}>
                      <div>
                        Sách:{" "}
                        <span>{book?.title || `ID ${request.book_id}`}</span>
                      </div>
                      <div>
                        User:{" "}
                        <span>{users[request.user_id] || request.user_id}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedBorrow && (
              <div className={styles.detailPanel}>
                <h3>Chi tiết yêu cầu</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Request ID:</span>
                    <span className={styles.detailValue}>
                      {selectedBorrow.id}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Book ID:</span>
                    <span className={styles.detailValue}>
                      {selectedBorrow.book_id}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Tên sách:</span>
                    <span className={styles.detailValue}>
                      {books[selectedBorrow.book_id]?.title}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>User ID:</span>
                    <span className={styles.detailValue}>
                      {selectedBorrow.user_id}
                    </span>
                  </div>
                </div>

                {/* --- ĐOẠN CODE NÚT BẤM ĐÃ CẬP NHẬT --- */}
                <div className={styles.actionButtons}>
                  <button
                    className={styles.btnApprove}
                    onClick={handleApproveBorrow}
                    disabled={processing}
                  >
                    {processing ? "Đang xử lý..." : "Phê duyệt"}
                  </button>

                  {/* Nút xóa màu đỏ */}
                  <button
                    onClick={handleDeleteBorrow}
                    disabled={processing}
                    style={{
                      backgroundColor: "#ef4444",
                      color: "white",
                      border: "none",
                      padding: "10px 20px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: "600",
                      marginLeft: "10px",
                    }}
                  >
                    {processing ? "..." : "Từ chối / Xóa"}
                  </button>
                </div>
                {/* ------------------------------------- */}
              </div>
            )}
          </div>

          {/* Right panel: Return requests (Giữ nguyên) */}
          <div className={styles.requestPanel}>
            {/* ... (Phần code bên phải giữ nguyên không đổi) ... */}
            <div className={styles.panelHeader}>
              <h2>Yêu cầu trả sách</h2>
              <p>Xác nhận các yêu cầu trả sách từ người dùng</p>
            </div>

            <div className={styles.requestList}>
              {returnRequests.length === 0 && (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📖</div>
                  <div>Không có yêu cầu trả nào</div>
                </div>
              )}

              {returnRequests.map((request) => {
                const book = books[request.book_id];
                return (
                  <div
                    key={request.id}
                    className={`${styles.requestCard} ${
                      selectedReturn?.id === request.id ? styles.selected : ""
                    }`}
                    onClick={() => setSelectedReturn(request)}
                  >
                    <div className={styles.requestCardHeader}>
                      <span className={styles.requestId}>
                        Request #{request.id}
                      </span>
                      <span className={getStatusBadgeClass(request.status)}>
                        {getStatusText(request.status)}
                      </span>
                    </div>
                    <div className={styles.requestInfo}>
                      <div>
                        Sách:{" "}
                        <span>{book?.title || `ID ${request.book_id}`}</span>
                      </div>
                      <div>
                        User:{" "}
                        <span>{users[request.user_id] || request.user_id}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedReturn && (
              <div className={styles.detailPanel}>
                <h3>Chi tiết yêu cầu</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Request ID:</span>
                    <span className={styles.detailValue}>
                      {selectedReturn.id}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Book ID:</span>
                    <span className={styles.detailValue}>
                      {selectedReturn.book_id}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Tên sách:</span>
                    <span className={styles.detailValue}>
                      {books[selectedReturn.book_id]?.title}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>User ID:</span>
                    <span className={styles.detailValue}>
                      {selectedReturn.user_id}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Trạng thái:</span>
                    <span className={styles.detailValue}>
                      {getStatusText(selectedReturn.status)}
                    </span>
                  </div>
                </div>
                <div className={styles.actionButtons}>
                  <button
                    className={styles.btnConfirm}
                    onClick={handleConfirmReturn}
                    disabled={processing}
                  >
                    {processing ? "Đang xử lý..." : "Xác nhận trả sách"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
