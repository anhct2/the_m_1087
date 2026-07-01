// Pure UI constants — không chứa mock data.
// Data thật được fetch từ api/client.js trong từng page.

export const STATUS = {
  enrolled:     ['green', '✓ đã nhận diện'],
  low_quality:  ['amber', '⚠ chất lượng thấp'],
  no_detection: ['dim',   '– không phát hiện'],
  failed:       ['red',   '✕ lỗi'],
  processing:   ['blue',  '… đang xử lý'],
  done:         ['green', '✓ xong'],
  pending:      ['dim',   '○ chờ xử lý'],
  running:      ['blue',  '… đang chạy'],
  skipped:      ['dim',   '– bỏ qua'],
  queued:       ['amber', '○ trong hàng đợi'],
  not_queued:   ['dim',   '– chưa xử lý'],
}

export const CONF = {
  gate_code:       ['green', 'mã cửa'],
  camera_chain:    ['teal',  'chuỗi camera'],
  appearance_only: ['amber', 'chỉ ngoại hình'],
  unknown:         ['dim',   'chưa rõ'],
}

export const REASON = {
  no_match:     ['amber', 'Không khớp'],
  low_quality:  ['amber', 'Chất lượng thấp'],
  no_detection: ['dim',   'Không phát hiện'],
  ambiguous:    ['blue',  'Nhập nhằng'],
}

export const CAM_COLORS = {
  N1: 'oklch(0.32 0.03 255)',
  S1: 'oklch(0.30 0.04 200)',
  S2: 'oklch(0.33 0.03 152)',
}

export const simColor = s => s >= 80 ? 'var(--in)' : s >= 60 ? 'var(--am)' : 'var(--alm)'
