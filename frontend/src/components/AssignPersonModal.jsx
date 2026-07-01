import { useState, useEffect } from 'react'
import { Modal, Btn, Icon, Avatar, Badge, Spinner } from './UI'
import { CONF } from '../pages/enrollData'
import { searchProfiles } from '../api/client'
import { snapUrl } from '../utils'

/**
 * Modal gán người vào 1 session — dùng chung cho Enroll (session drawer)
 * và Gate Log (nút "Gán phòng" thủ công). Chỉ khác nhau ở onAssign().
 */
export function AssignPersonModal({ title = 'Gán người vào session', defaultRoom = '', onAssign, onClose }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [newName, setNewName] = useState('')
  const [newRoom, setNewRoom] = useState(defaultRoom)

  useEffect(() => {
    setLoading(true)
    searchProfiles(query)
      .then(r => setResults(r.data))
      .finally(() => setLoading(false))
  }, [query])

  function doAssign(payload) {
    setSaving(true)
    setError('')
    Promise.resolve(onAssign(payload))
      .then(onClose)
      .catch(e => setError(e?.response?.data?.detail || 'Gán thất bại'))
      .finally(() => setSaving(false))
  }

  return (
    <Modal onClose={onClose} width={440} align="top">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--ln)' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, background: 'transparent', border: '1px solid var(--ln)', color: 'var(--tlo)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={13} /></button>
      </div>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 11, color: 'var(--txl)', textTransform: 'uppercase', letterSpacing: '0.8px', fontFamily: 'var(--mono)', marginBottom: 8 }}>Tìm hồ sơ</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 9, padding: '0 12px', height: 40, marginBottom: 10 }}>
          <Icon name="search" size={15} style={{ color: 'var(--tlo)' }} />
          <input
            placeholder="Tìm theo tên hoặc phòng…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--thi)', fontSize: 13, fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
          {loading ? <div style={{ padding: 12, textAlign: 'center' }}><Spinner size={14} /></div>
            : results.map(p => {
              const [ck, cl] = CONF[p.confidence_lvl] ?? ['dim', 'unknown']
              return (
                <div key={p.id} onClick={() => !saving && doAssign({ profile_id: p.id })} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                  <Avatar gender={p.gender} size={34} src={snapUrl(p.face_event_id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.display_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--tlo)', fontFamily: 'var(--mono)' }}>{p.known_room}</div>
                  </div>
                  <Badge kind={ck}>{cl}</Badge>
                </div>
              )
            })
          }
          {!loading && !results.length && (
            <div style={{ fontSize: 11.5, color: 'var(--txl)', padding: '6px 4px' }}>Không tìm thấy hồ sơ nào</div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--bg2)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--txl)', textTransform: 'uppercase', letterSpacing: '0.8px', fontFamily: 'var(--mono)', marginBottom: 8 }}>Tạo người mới</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Tên…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              style={{ flex: 2, background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: '7px 10px', color: 'var(--thi)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }}
            />
            <input
              placeholder="Phòng (P.301)…"
              value={newRoom}
              onChange={e => setNewRoom(e.target.value)}
              style={{ flex: 1, background: 'var(--bg0)', border: '1px solid var(--ln)', borderRadius: 8, padding: '7px 10px', color: 'var(--thi)', fontSize: 12.5, fontFamily: 'inherit', outline: 'none' }}
            />
          </div>
          <Btn variant="ghost" onClick={() => doAssign({ display_name: newName.trim(), known_room: newRoom.trim() })} disabled={saving || !newName.trim()} style={{ width: '100%', marginTop: 8 }}>
            {saving ? '…' : '＋ Tạo & gán'}
          </Btn>
        </div>
        {error && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--alm)' }}>{error}</div>}
      </div>
    </Modal>
  )
}
