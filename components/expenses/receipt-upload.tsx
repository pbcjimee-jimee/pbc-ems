export function ReceiptUpload() {
  return <div className="field"><label htmlFor="receipt">Receipt file</label><input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-describedby="receipt-hint" /><p className="field-hint" id="receipt-hint">Private JPEG, PNG, WebP or PDF, up to 10 MiB. A new file replaces the current receipt when saved. The selected file is kept if saving fails.</p></div>;
}
