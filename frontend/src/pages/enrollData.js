// Pure UI constants — không chứa mock data.
// Data thật được fetch từ api/client.js trong từng page.

export const STATUS = {
  enrolled:     ['green', '✓ enrolled'],
  low_quality:  ['amber', '⚠ low quality'],
  no_detection: ['dim',   '– no detection'],
  failed:       ['red',   '✕ failed'],
  processing:   ['blue',  '… processing'],
  done:         ['green', '✓ done'],
  pending:      ['dim',   '○ pending'],
  running:      ['blue',  '… running'],
  skipped:      ['dim',   '– skipped'],
}

export const CONF = {
  gate_code:       ['green', 'gate code'],
  camera_chain:    ['teal',  'camera chain'],
  appearance_only: ['amber', 'appearance'],
  unknown:         ['dim',   'unknown'],
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
