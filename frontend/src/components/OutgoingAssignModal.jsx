import { useState, useEffect } from 'react'
import { Modal, Btn, Icon, Avatar, Badge, Spinner } from './UI'
import { CONF } from '../pages/enrollData'
import { getRoomCodes, getRoomDayProfiles, assignGateSession, assignGateSessionRoom } from '../api/client'
import { snapUrl } from '../utils'

let roomCodesCache = null

/**
 * Gán phòng thủ công cho session OUTGOING (Ra).
 * - Bắt buộc: chọn/nhập phòng.
 * - Tuỳ chọn: chọn đúng người trong danh sách đã enroll INCOMING của phòng đó
 *   trong cùng CỬA SỔ PHÒNG (12h trưa → 12h trưa hôm sau) — lượt ra 9h sáng
 *   vẫn thấy khách vào chiều hôm trước. Nếu không chọn người → chỉ gán phòng,
 *   worker sẽ enroll lại và tự xác định người.
 * ts: event_time (ISO) của lượt Ra — BE dùng để xác định cửa sổ phòng.
 */
export function OutgoingAssignModal({ doorId, ts, defaultRoom = '', onAssigned, onClose }) {
  const [codes, setCodes]   = useState(roomCodesCache || [])
  const [room, setRoom]     = useState(defaultRoom)
  const [profiles, setProfiles] = useState([])
  const [loadingP, setLoadingP] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (roomCodesCache) return
    getRoomCodes().then(r => { roomCodesCache = r.data; setCodes(r.data) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!room || !ts) { setProfiles([]); return }
    setLoadingP(true)
    getRoomDayProfiles(room, ts)
      .then(r => setProfiles(r.data))
      .catch(() => setProfiles([]))
      .finally(() => setLoadingP(false))
  }, [room, ts])

  function run(promise) {
    setSaving(true); setError('')
    promise
      .then(() => onAssigned())
      .catch(e => setError(e?.response?.data?.detail || 'Gán thất bại'))
      .finally(() => setSaving(false))
  }

  const assignRoomOnly = () => run(assignGateSessionRoom(doorId, { known_room: room, source: 'gate_log' }))
  const assignProfile  = (pid) => run(assignGateSession(doorId, { profile_id: pid, known_room: room, source: 'gate_log' }))

  return (
    <Modal onClose={onClose} width={440} align="top">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--ln)' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Gán phòng cho lượt Ra</span>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: '1px solid var(--ln)', color: 'var(--tlo)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={13} /></button>
      </div>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 11, color: 'var(--txl)', textTransform: 'uppercase', letterSpacing: '0.8px', fontFamily: 'var(--mono)', marginBottom: 8 }}>Chọn phòng</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {codes.map(c => (
            <span key={c} onClick={() => setRoom(c)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${room === c ? 'var(--in3)' : 'var(--ln)'}`, background: room === c ? 'var(--inb)' : 'transparent', color: room === c ? 'oklch(0.85 0.11 152)' : 'var(--tmd)', fontFamily: 'var(--mono)' }}>{c}</span>
          ))}
        </div>

        {room && (
          <>
            <div style={{ fontSize: 11, color: 'var(--txl)', textTransform: 'uppercase', letterSpacing: '0.8px', fontFamily: 'var(--mono)', marginBottom: 8 }}>
              Người đã vào {room} trong cửa sổ phòng (tuỳ chọn)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 190, overflowY: 'auto', marginBottom: 12 }}>
              {loadingP ? <div style={{ padding: 12, textAlign: 'center' }}><Spinner size={14} /></div>
                : profiles.length === 0 ? <div style={{ fontSize: 11.5, color: 'var(--txl)', padding: '4px 2px' }}>Không có ai enroll incoming cho phòng này trong cửa sổ phòng — cứ gán phòng, worker sẽ tự xác định.</div>
                : profiles.map(p => {
                  const [ck, cl] = CONF[p.confidence_lvl] ?? ['dim', 'unknown']
                  return (
                    <div key={p.id} onClick={() => !saving && assignProfile(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9, cursor: saving ? 'default' : 'pointer', border: '1px solid var(--bg2)' }}>
                      <Avatar gender={p.gender} size={40} src={snapUrl(p.face_event_id)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{p.display_name || 'Chưa đặt tên'}</div>
                        <div style={{ fontSize: 11, color: 'var(--tlo)', fontFamily: 'var(--mono)' }}>{p.known_room}</div>
                      </div>
                      <Badge kind={ck}>{cl}</Badge>
                    </div>
                  )
                })
              }
            </div>
            <Btn variant="primary" onClick={assignRoomOnly} disabled={saving} style={{ width: '100%' }}>
              {saving ? '…' : `Chỉ gán phòng ${room} · để worker xác định người`}
            </Btn>
          </>
        )}
        {error && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--alm)' }}>{error}</div>}
      </div>
    </Modal>
  )
}
