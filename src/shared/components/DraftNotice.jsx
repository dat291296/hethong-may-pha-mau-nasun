export default function DraftNotice({ draft }) {
  return <div className="draft-notice" role="status"><span>{draft.status}</span>{draft.existing && <div className="workspace-actions"><button type="button" className="btn btn-primary btn-sm" onClick={draft.resume}>Khôi phục bản nháp</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => draft.discard().catch(() => {})}>Bỏ bản nháp cũ</button></div>}</div>;
}
