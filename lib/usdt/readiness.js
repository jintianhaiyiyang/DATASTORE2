// Historical catch-up and current payment coverage are independent. Never
// advance the durable historical cursor merely to allow a new invoice.
export function scanReady(watch, head, now = Date.now()) {
  const time = watch?.lastLiveSuccessAt ?? watch?.lastSuccessAt;
  const block = watch?.lastLiveScannedBlock ?? watch?.lastScannedBlock;
  return !!time && now - time <= 180000 && Number.isSafeInteger(block) && head.number - block <= 400;
}
