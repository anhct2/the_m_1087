import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Btn, Spinner, Empty } from '../../components/UI'
import { getDuplicates, dismissCluster } from '../../api/client'
import { snapUrl } from '../../utils'

export default function EnrollDuplicates() {
  const navigate = useNavigate()
  const [clusters, setClusters] = useState([])
  const [loading, setLoading]   = useState(true)

  function load() {
    setLoading(true)
    getDuplicates().then(r => setClusters(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function handleDismiss(cluster) {
    const memberIds = cluster.members.slice(1).map(m => m.id)
    dismissCluster(cluster.cluster_id, { member_ids: memberIds })
      .then(() => setClusters(cs => cs.filter(c => c.cluster_id !== cluster.cluster_id)))
  }

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
  if (!clusters.length) return <Empty message="Không phát hiện profile trùng lặp" />

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--tlo)', marginBottom: 14 }}>
        {clusters.length} cluster trùng lặp · threshold cosine similarity ≥ 0.82
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {clusters.map(cluster => {
          const [a, b] = cluster.members
          return (
            <div key={cluster.cluster_id} style={{ background: 'var(--bg1)', border: '1px solid var(--ln)', borderRadius: 13, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--am)' }}>{Math.round(cluster.max_similarity * 100)}%</span>
                  <span style={{ fontSize: 10.5, color: 'var(--tlo)' }}>similarity · {cluster.members.length} profiles</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                {[a, b].map((m, i) => m && (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderRadius: 10, border: '1px solid var(--ln)', padding: '12px 8px' }}>
                    <Avatar gender={m.gender} size={48} src={snapUrl(m.face_event_id)} />
                    <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'center' }}>{m.display_name || '—'}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--tlo)' }}>{m.known_room || '—'}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--txl)' }}>×{m.enroll_count} enrolls</div>
                    {i === 1 && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--am)' }}>{Math.round(m.similarity * 100)}% sim</div>}
                  </div>
                ))}
                {cluster.members.length > 2 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px dashed var(--ln)', padding: '12px 8px', minWidth: 52, color: 'var(--txl)', fontSize: 11 }}>
                    +{cluster.members.length - 2}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" style={{ flex: 1, fontSize: 11.5 }} onClick={() => handleDismiss(cluster)}>Bỏ qua</Btn>
                <Btn variant="primary" style={{ flex: 1, fontSize: 11.5 }} onClick={() => navigate(`/enroll/merge/${cluster.cluster_id}`)}>Xem / Gộp</Btn>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
