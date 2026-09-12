import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/router";
import { QRCodeSVG } from "qrcode.react";
import { consumeWechatPayIntent, getH5JumpUrl, getPaymentClientType, invokeWeChatPay, isPaymentOrderId, readCheckoutResponse, rememberWechatPayIntent, safeStorage } from "../lib/paymentClient";
import styles from "../styles/Detail.module.css";

const subscribe = () => () => {};

function PaymentDialog({ codeUrl, name, price, message, onClose, onCheck }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (node.showModal) node.showModal();
    else node.setAttribute("open", "");
    node.querySelector("button")?.focus();
    // Also trap focus in older embedded browsers without native dialog support.
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const items = [...node.querySelectorAll("button:not(:disabled), a[href]")];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <dialog ref={dialog} className={styles.modalContent} aria-labelledby="payment-dialog-title"
        aria-describedby="payment-dialog-tip" onCancel={onClose}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
        }}>
        <button type="button" className={styles.closeIcon} onClick={onClose} aria-label="关闭支付窗口">×</button>
        <h2 id="payment-dialog-title" className={styles.modalTitle}>微信扫码支付</h2>
        <p className={styles.orderName}>{name}</p>
        <p className={styles.modalAmount}>¥{Number(price).toFixed(2)}</p>
        <div className={styles.qrWrapper}>
          <QRCodeSVG value={codeUrl} size={224} marginSize={4} title="微信支付二维码" />
        </div>
        <p id="payment-dialog-tip" className={styles.modalTip}>请用微信扫一扫。手机或平板上可使用另一台设备扫码，也可尝试截图后从微信相册识别。</p>
        <p className={styles.paymentStatus} role="status">{message || "等待支付，完成后自动解锁"}</p>
        <button type="button" className={styles.downloadBtn} onClick={onCheck}>我已支付，检查结果</button>
        <button type="button" className={styles.modalCloseBtn} onClick={onClose}>稍后支付</button>
      </dialog>
    </div>
  );
}

export default function PaymentPanel({ dataset, user, onPaid }) {
  const router = useRouter();
  const clientType = useSyncExternalStore(subscribe, getPaymentClientType, () => "native");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState(null);
  const [orderId, setOrderId] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [checkVersion, setCheckVersion] = useState(0);
  const checkoutRequest = useRef(null);
  const key = user?.email ? `pendingOrder:${encodeURIComponent(user.email.toLowerCase())}:${dataset.id}` : "";
  const returnedOrder = router.query.payOrder;
  const closeQr = useCallback(() => setShowQr(false), []);

  useEffect(() => {
    let active = true;
    // This component mounts only after the resource and current user have loaded.
    // Never erase a pending order simply because the initial dataset is null.
    Promise.resolve().then(() => {
      if (!active || !key) return;
      const saved = returnedOrder || safeStorage("get", key) || safeStorage("get", `pendingOrder:${dataset.id}`);
      if (isPaymentOrderId(saved)) {
        setOrderId(saved);
        setStatus("正在确认上次支付结果，请勿重复付款");
      }
    });
    return () => { active = false; };
  }, [key, dataset.id, returnedOrder]);

  useEffect(() => () => checkoutRequest.current?.abort(), []);

  useEffect(() => {
    if (!orderId || !key) return;
    const controller = new AbortController();
    let timer;
    let running = false;
    let stopped = false;
    let attempts = 0;
    const forget = () => {
      safeStorage("remove", key);
      safeStorage("remove", `pendingOrder:${dataset.id}`);
    };
    const poll = async () => {
      clearTimeout(timer);
      if (stopped || running || controller.signal.aborted) return;
      if (document.visibilityState === "hidden") return;
      if (++attempts > 150) {
        setStatus("自动查询已暂停，支付后可点击“检查支付结果”");
        return;
      }
      running = true;
      let delay = 3000;
      try {
        const res = await fetch(`/api/check-order?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store", signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (res.ok && data.paid) {
          stopped = true;
          forget();
          setShowQr(false);
          setStatus("支付成功，正在解锁下载");
          try { await onPaid(); }
          catch { if (!controller.signal.aborted) setStatus("付款已确认，请刷新页面获取下载链接"); }
          return;
        }
        if ([400, 401, 403, 404, 409].includes(res.status) || ["CLOSED", "REVOKED", "PAYERROR", "REFUND"].includes(data.state)) {
          stopped = true;
          if (res.status !== 401 && res.status !== 409) forget();
          setOrderId("");
          setShowQr(false);
          setPayment(null);
          setStatus(res.status === 401 ? "登录已过期，请重新登录后检查付款结果" : data.message || "订单已结束，请重新发起支付");
          return;
        }
        if (res.status === 429) {
          delay = Math.max(3000, Math.min(300000, (Number(res.headers.get("Retry-After")) || 30) * 1000));
          setStatus("查询较频繁，稍后自动重试，请勿重复付款");
        } else if (!res.ok) {
          delay = 10000;
          setStatus("暂时无法确认结果，将自动重试，请勿重复付款");
        } else setStatus("等待支付确认，完成后自动解锁");
      } catch {
        if (!controller.signal.aborted) setStatus("网络暂时中断，恢复后会继续确认支付");
        delay = 10000;
      } finally {
        running = false;
        if (!stopped && !controller.signal.aborted) timer = setTimeout(poll, delay);
      }
    };
    const resume = () => { if (document.visibilityState !== "hidden") void poll(); };
    void poll();
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [orderId, key, dataset.id, onPaid, checkVersion]);

  const buy = useCallback(async (type) => {
    if (checkoutRequest.current) return;
    if (!user?.isLoggedIn) {
      await router.push(`/login?next=${encodeURIComponent(router.asPath)}`);
      return;
    }
    const controller = new AbortController();
    checkoutRequest.current = controller;
    setBusy(true);
    setError("");
    try {
      let data = payment?.type === (type === "native" ? "qrcode" : type) ? payment : null;
      if (!data) {
        // The server may close the previous order while changing channels.
        // Never offer its cached QR code again if the next request fails.
        setPayment(null);
        setShowQr(false);
        const res = await fetch("/api/checkout", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ datasetId: dataset.id, clientType: type, previousOrderId: orderId || undefined }),
        });
        data = await readCheckoutResponse(res);
        if (controller.signal.aborted) return;
        if (data.needOauth) {
          rememberWechatPayIntent(key);
          const back = new URL(window.location.href);
          back.searchParams.delete("wechatPay");
          // A full navigation is required for the external OAuth redirect.
          const oauth = new URL("/api/wechat/oauth/start", window.location.origin);
          oauth.searchParams.set("redirect", back.toString());
          window.location.assign(oauth.toString());
          return;
        }
        if (res.status === 401) { await router.push(`/login?next=${encodeURIComponent(router.asPath)}`); return; }
        if (res.status === 409) { await onPaid(); return; }
        if (!res.ok) throw new Error(data.message);
        if (!isPaymentOrderId(data.outTradeNo)) throw new Error("订单信息不完整，请重试");
        setOrderId(data.outTradeNo);
        safeStorage("set", key, data.outTradeNo);
        if (data.type === "h5") getH5JumpUrl(data.mwebUrl, window.location.href, data.outTradeNo);
        if ((data.type === "qrcode" && !data.codeUrl) || (data.type === "jsapi" && !data.payParams) ||
            !["qrcode", "h5", "jsapi"].includes(data.type)) throw new Error("支付参数不完整，请稍后重试");
        setPayment(data);
      }
      if (data.type === "qrcode" && data.codeUrl) {
        setShowQr(true);
      } else if (data.type === "h5" && data.mwebUrl) {
        window.location.assign(getH5JumpUrl(data.mwebUrl, window.location.href, data.outTradeNo));
      } else if (data.type === "jsapi" && data.payParams) {
        const result = await invokeWeChatPay(data.payParams, controller.signal);
        if (controller.signal.aborted) return;
        if (result.endsWith(":cancel")) setStatus("已取消调起支付，可继续支付或改用二维码");
        else if (!result.endsWith(":ok")) throw new Error("微信支付未完成，可重试或改用扫码支付");
        else setCheckVersion((version) => version + 1);
      } else throw new Error("支付参数不完整，请稍后重试");
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || "支付失败，请稍后重试");
    } finally {
      if (checkoutRequest.current === controller) checkoutRequest.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [dataset.id, key, onPaid, orderId, payment, router, user?.isLoggedIn]);

  useEffect(() => {
    if (clientType !== "jsapi" || router.query.wechatPay !== "ready" || !user?.isLoggedIn) return;
    // Defer until pending-order restoration has rendered. Strict Mode can
    // cancel this timer without consuming the one-time intent prematurely.
    const timer = setTimeout(() => {
      if (consumeWechatPayIntent(key)) void buy("jsapi");
    }, 0);
    return () => clearTimeout(timer);
  }, [buy, clientType, key, router.query.wechatPay, user?.isLoggedIn]);

  return (
    <>
      <div className={styles.paymentActions}>
        {router.query.wechatPay === "ready" && <p className={styles.paymentStatus}>微信授权已完成，正在继续支付。若未弹出收银台，可点击下方按钮重试。</p>}
        {router.query.wechatPay === "failed" && <p className={styles.paymentError}>微信授权未完成，可重试或使用扫码支付</p>}
        {error && <p className={styles.paymentError} role="alert">{error}</p>}
        <button type="button" onClick={() => buy(clientType)} disabled={busy} className={styles.wechatBtn}>
          {busy ? "正在连接微信…" : clientType === "native" ? "微信扫码支付" : "微信支付"}
        </button>
        {clientType !== "native" && <button type="button" onClick={() => buy("native")} disabled={busy} className={styles.secondaryPayBtn}>显示支付二维码</button>}
        {status && <p className={styles.paymentStatus} role="status">{status}</p>}
        {orderId && <button type="button" className={styles.checkBtn} onClick={() => setCheckVersion((version) => version + 1)}>检查支付结果</button>}
      </div>
      {showQr && payment?.codeUrl && <PaymentDialog codeUrl={payment.codeUrl} name={dataset.name} price={dataset.price} message={status} onClose={closeQr} onCheck={() => setCheckVersion((version) => version + 1)} />}
    </>
  );
}
