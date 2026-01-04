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
  const [books, setBooks] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [processing, setProcessing] = useState({});

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
      const submitted = allRequests.filter((req) => req.status === "submitted");
      const returning = allRequests.filter(
        (req) => req.status === "return_requested"
      );

      setBorrowRequests(submitted);
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
    }
    setLoading(false);
  };

  const handleApproveBorrow = async (requestId) => {
    setProcessing((prev) => ({ ...prev, [requestId]: true }));
    setMessage({ type: "", text: "" });

    const result = await api.approveBorrow(
      { username: user.username, password: user.password },
      requestId
    );
    setProcessing((prev) => ({ ...prev, [requestId]: false }));

    if (result.ok && result.data?.status === "success") {
      setMessage({ type: "success", text: "Đã phê duyệt yêu cầu!" });
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

  const handleRejectBorrow = async (requestId) => {
    if (!confirm(`Bạn có chắc chắn muốn từ chối yêu cầu #${requestId}?`)) return;

    setProcessing((prev) => ({ ...prev, [requestId]: true }));
    setMessage({ type: "", text: "" });

    const result = await api.deleteBorrowRequest(
      { username: user.username, password: user.password },
      requestId
    );
    setProcessing((prev) => ({ ...prev, [requestId]: false }));

    if (result.ok && result.data?.status === "success") {
      setMessage({ type: "success", text: "Đã từ chối yêu cầu!" });
      setTimeout(() => {
        setMessage({ type: "", text: "" });
        loadRequests();
      }, 1500);
    } else {
      setMessage({
        type: "error",
        text: result.data?.message || "Không thể từ chối",
      });
    }
  };

  const handleConfirmReturn = async (requestId) => {
    setProcessing((prev) => ({ ...prev, [requestId]: true }));
    setMessage({ type: "", text: "" });

    const result = await api.confirmReturn(
      { username: user.username, password: user.password },
      requestId
    );
    setProcessing((prev) => ({ ...prev, [requestId]: false }));

    if (result.ok && result.data?.status === "success") {
      setMessage({ type: "success", text: "Đã xác nhận trả sách!" });
      setTimeout(() => {
        setMessage({ type: "", text: "" });
        loadRequests();
      }, 1500);
    } else {
      setMessage({
        type: "error",
        text: result.data?.message || "Không thể xác nhận",
      });
    }
  };

  const handleConfirmAllReturns = async () => {
    if (returnRequests.length === 0) {
      alert("Không có yêu cầu trả nào!");
      return;
    }

    if (!confirm(`Xác nhận trả tất cả ${returnRequests.length} yêu cầu?`)) {
      return;
    }

    setProcessing({ confirmAll: true });
    setMessage({ type: "", text: "" });

    const batches = groupByBatch(returnRequests);
    let successCount = 0;
    let errorCount = 0;

    for (const batch of batches) {
      const firstReqId = batch[0].id;
      const result = await api.confirmReturn(
        { username: user.username, password: user.password },
        firstReqId
      );

      if (result.ok && result.data?.status === "success") {
        successCount++;
      } else {
        errorCount++;
      }
    }

    setProcessing({});

    if (errorCount === 0) {
      setMessage({
        type: "success",
        text: `Đã xác nhận trả ${successCount} phiếu!`,
      });
    } else {
      setMessage({
        type: "error",
        text: `Xác nhận ${successCount} phiếu thành công, ${errorCount} phiếu thất bại`,
      });
    }

    setTimeout(() => {
      setMessage({ type: "", text: "" });
      loadRequests();
    }, 2000);
  };

  const getStatusText = (status) => {
    const map = {
      pending: "Chờ duyệt",
      submitted: "Chờ duyệt",
      approved: "Đã duyệt",
      return_requested: "Yêu cầu trả",
      returned: "Đã trả",
    };
    return map[status] || status;
  };

  // Group requests by batch_id
  const groupByBatch = (requests) => {
    const batches = {};
    requests.forEach((req) => {
      const batchId = req.batch_id || `single_${req.id}`;
      if (!batches[batchId]) {
        batches[batchId] = [];
      }
      batches[batchId].push(req);
    });
    return Object.values(batches);
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
          {/* Yêu cầu mượn sách */}
          <div className={styles.requestPanel}>
            <div className={styles.panelHeader}>
              <h2>Yêu cầu mượn sách ({borrowRequests.length})</h2>
            </div>

            <div className={styles.requestList}>
              {borrowRequests.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📚</div>
                  <div>Không có yêu cầu mượn nào</div>
                </div>
              ) : (
                groupByBatch(borrowRequests).map((batch, batchIdx) => {
                  const firstReq = batch[0];
                  const isProcessing = processing[firstReq.id];
                  return (
                    <div key={batchIdx} className={styles.batchCard}>
                      <div className={styles.batchHeader}>
                        <span className={styles.batchId}>
                          Phiếu mượn #{firstReq.id} - User {firstReq.user_id}
                        </span>
                        <span className={styles.bookCount}>
                          {batch.length} sách
                        </span>
                      </div>
                      <div className={styles.batchBooks}>
                        {batch.map((request) => {
                          const book = books[request.book_id];
                          return (
                            <div key={request.id} className={styles.bookItem}>
                              • {book?.title || `Book ID ${request.book_id}`}
                              {book && book.available <= 0 && (
                                <span className={styles.outOfStock}> (Hết sách)</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className={styles.actionButtons}>
                        <button
                          className={styles.btnApprove}
                          onClick={() => handleApproveBorrow(firstReq.id)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? "..." : "✓ Phê duyệt phiếu"}
                        </button>
                        <button
                          className={styles.btnReject}
                          onClick={() => handleRejectBorrow(firstReq.id)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? "..." : "✕ Từ chối"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Yêu cầu trả sách */}
          <div className={styles.requestPanel}>
            <div className={styles.panelHeader}>
              <h2>Yêu cầu trả sách ({returnRequests.length})</h2>
              {returnRequests.length > 0 && (
                <button
                  className={styles.btnConfirmAll}
                  onClick={handleConfirmAllReturns}
                  disabled={processing.confirmAll}
                >
                  {processing.confirmAll ? "Đang xử lý..." : "✓ Xác nhận toàn bộ"}
                </button>
              )}
            </div>

            <div className={styles.requestList}>
              {returnRequests.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📖</div>
                  <div>Không có yêu cầu trả nào</div>
                </div>
              ) : (
                groupByBatch(returnRequests).map((batch, batchIdx) => {
                  const firstReq = batch[0];
                  const isProcessing = processing[firstReq.id];
                  return (
                    <div key={batchIdx} className={styles.batchCard}>
                      <div className={styles.batchHeader}>
                        <span className={styles.batchId}>
                          Phiếu trả #{firstReq.id} - User {firstReq.user_id}
                        </span>
                        <span className={styles.bookCount}>
                          {batch.length} sách
                        </span>
                      </div>
                      <div className={styles.batchBooks}>
                        {batch.map((request) => {
                          const book = books[request.book_id];
                          return (
                            <div key={request.id} className={styles.bookItem}>
                              • {book?.title || `Book ID ${request.book_id}`} ({getStatusText(request.status)})
                            </div>
                          );
                        })}
                      </div>
                      <div className={styles.actionButtons}>
                        <button
                          className={styles.btnConfirm}
                          onClick={() => handleConfirmReturn(firstReq.id)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? "..." : "✓ Xác nhận trả phiếu"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
