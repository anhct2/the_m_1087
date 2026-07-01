import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Icon, Avatar, Btn, Modal, SimBar, Spinner } from '../components/UI'
import { CONF } from './enrollData'
import { getDuplicateCluster, mergeProfiles, dismissCluster } from '../api/client'
import { snapUrl, fmtDate } from '../utils'

export default function EnrollMerge() {
  const { clusterId } = useParams()
  const navigate = useNavigate()
  const [cluster, setCluster] = useState(null)
  const [primary, setPrimary] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    getDuplicateCluster(clusterId)
      .then(r => setCluster(r.data))
      .finally(() => setLoading(false))
  }, [clusterId])

  async function doMerge() {
    const mergeIds = cluster.members.filter((_, i) => i !== primary).map(m => m.id)
    setMerging(true)
    try {
      await mergeProfiles({ primary_id: cluster.members[primary].id, merge_ids: mergeIds })
      setConfirm(false)
      navigate('/enroll/duplicates')
    } finally {
      setMerging(false)
    }
  }

  async function doDismiss() {
    const memberIds = cluster.members.slice(1).map(m => m.id)
    await dismissCluster(clusterId, { member_ids: memberIds })
    navigate('/enroll/duplicates')
  }

  if (loading) return <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner size={24} /></div>
  if (!cluster) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--txl)' }}>Không tìm thấy cluster</div>

  return (
    <div style={{ padding: '20px 24px' }}>
      <button onClick={() => navigate('/enroll/duplicates')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: 'var(--tlo)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <Icon name="chevLeft" size={14} />Enroll / Trùng lặp / <span style={{ color: 'var(--tmd)' }}>Gộp hồ sơ</span>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px', margin: 0 }}>Hồ sơ trùng lặp</h1>
          <div style={{ fontSize: 12, color: 'var(--tlo)', marginTop: 4 }}>
            {cluster.members.length} profiles tương tự nhau
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="ghost" onClick={doDismiss}><Icon name="x" size={12} />Không phải trùng</Btn>
          <Btn variant="primary" onClick={() => setConfirm(true)}><Icon name="merge" size={12} />Gộp hồ sơ</Btn>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--tlo)', marginBottom: 14 }}>
        Click vào hồ sơ để chọn làm primary — các hồ sơ còn lại sẽ được gộp vào đây.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        {cluster.members.map((m, i) => {
          const isPrimary = i === primary
          const [ck, cl] = CONF[m.confidence_lvl] ?? ['dim', m.confidence_lvl ?? 'unknown']
          return (
            <div key={m.id} onClick={() => setPrimary(i)} style={{ background: isPrimary ? 'oklch(0.2 0.04 152 / 0.4)' : 'var(--bg1)', border: `2px solid ${isPrimary ? 'var(--in)' : 'var(--ln)'}`, borderRadius: 13, padding: 18, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', transition: 'border-color 0.15s' }}>
              {isPrimary && (
                <div style={{ position: 'absolute', top: 10, right: 10, background: 'var(--in)', color: 'oklch(0.15 0.02 152)', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px' }}>PRIMARY</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar gender={m.gender} size={54} src={snapUrl(m.face_event_id)} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{m.display_name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--tlo)', marginTop: 4 }}>
                    {m.gender === 'female' ? 'Nữ' : m.gender === 'male' ? 'Nam' : '—'}
                    {m.age_estimate ? ` · ~${m.age_estimate}t` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Badge kind={ck}>{cl}</Badge>
                {m.known_room && <Badge kind="teal">{m.known_room}</Badge>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--tlo)' }}>Face quality</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--tmd)' }}>{m.face_quality?.toFixed(2) ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--tlo)' }}>Enroll count</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--tmd)' }}>×{m.enroll_count}</span>
                </div>
                {m.similarity < 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'var(--tlo)' }}>Similarity</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <SimBar value={m.similarity} width={60} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--am)' }}>{Math.round(m.similarity * 100)}%</span>
                    </span>
                  </div>
                )}
                {m.last_seen_ts && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--tlo)' }}>Lần cuối</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--txl)' }}>{fmtDate(m.last_seen_ts)}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {confirm && (
        <Modal onClose={() => !merging && setConfirm(false)}>
          <div style={{ padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Xác nhận gộp hồ sơ</div>
            <div style={{ fontSize: 12.5, color: 'var(--tlo)', lineHeight: 1.7, marginBottom: 20 }}>
              Profile chính: <strong style={{ color: 'var(--thi)' }}>{cluster.members[primary].display_name}</strong><br />
              Sẽ gộp {cluster.members.length - 1} profile khác vào. Hành động này không thể hoàn tác.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setConfirm(false)} disabled={merging}>Huỷ</Btn>
              <Btn variant="primary" onClick={doMerge} disabled={merging}>
                {merging ? 'Đang gộp…' : 'Xác nhận gộp'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
