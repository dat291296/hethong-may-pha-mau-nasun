import React,{useMemo,useState} from 'react';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid,Legend} from 'recharts';
import {buildSystemHealth} from '../lib/systemHealth.js';
import SafePortal from '../../../shared/components/SafePortal.jsx';
import {useModalScrollLock} from '../../../shared/hooks/useModalScrollLock.js';
import './stableDevices.css';
const chartStyle={background:'#0f172a',border:'1px solid #334155',borderRadius:8,color:'#f1f5f9'};
function Chart({rows,title,onPick,stacked=true,limit=8}){
 return <article className="health-chart"><h4>{title}</h4>{rows.length?<><ResponsiveContainer width="100%" height={220}><BarChart data={rows.slice(0,limit)} margin={{left:0,right:12,bottom:18}}><CartesianGrid stroke="#334155" strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fill:'#94a3b8',fontSize:10}} tickFormatter={value=>value.length>20?value.slice(0,18)+'…':value}/><YAxis allowDecimals={false} tick={{fill:'#94a3b8',fontSize:11}}/><Tooltip contentStyle={chartStyle}/>{stacked?<><Legend/><Bar dataKey="repairs" name="Sửa chữa" stackId="reports" fill="#38bdf8" onClick={onPick}/><Bar dataKey="exchanges" name="Đổi trả" stackId="reports" fill="#f59e0b" onClick={onPick}/></>:<Bar dataKey="total" name="Số bộ máy" fill="#34d399"/>}</BarChart></ResponsiveContainer>{stacked&&<details><summary>Xem phiếu</summary><div className="health-chart-links">{rows.slice(0,limit).map(row=><button className="btn btn-secondary btn-sm" key={row.id} onClick={()=>onPick(row)}>{row.name} ({row.total})</button>)}</div></details>}</>:<p className="resource-muted">Chưa có phiếu phù hợp trong kỳ.</p>}</article>;
}
const percentage=value=>value==null?'—':value.toLocaleString('vi-VN',{maximumFractionDigits:1})+'%';
export default function SystemHealthPanel({machines,devices,tickets,events,npps,historyError,onNavigate}){
 const [from,setFrom]=useState('');const [to,setTo]=useState('');const [category,setCategory]=useState('ALL');const [nppId,setNppId]=useState('ALL');const [selection,setSelection]=useState(null);const [page,setPage]=useState(1);
 useModalScrollLock(Boolean(selection));
 const invalid=Boolean(from&&to&&from>to);
 const health=useMemo(()=>buildSystemHealth({machines,devices,tickets,events,npps,from,to,category,nppId}),[machines,devices,tickets,events,npps,from,to,category,nppId]);
 const pick=row=>{const record=row?.payload||row;if(record?.tickets){setPage(1);setSelection(record);}};
 const selectionPages=Math.max(1,Math.ceil((selection?.tickets.length||0)/25));
 return <section className="glass-panel system-health-panel" aria-label="Sức khỏe hệ thống máy pha màu">
  <div className="health-filters"><label>Từ ngày<input type="date" className="form-input" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>Đến ngày<input type="date" className="form-input" value={to} onChange={event=>setTo(event.target.value)}/></label><label>Loại thiết bị<select className="form-select" value={category} onChange={event=>setCategory(event.target.value)}><option value="ALL">Tất cả</option>{[['computer','Máy tính'],['dispenser','Máy chiết'],['mixer','Máy lắc'],['printer','Máy in']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Nhà phân phối<select className="form-select" value={nppId} onChange={event=>setNppId(event.target.value)}><option value="ALL">Tất cả NPP</option>{npps.map(npp=><option value={npp.id} key={npp.id}>{npp.name}</option>)}</select></label></div>
  {invalid?<p className="resource-error" role="alert">Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.</p>:<>
   {historyError&&<p className="resource-error" role="alert">{historyError}</p>}
   <div className="health-metrics"><article><strong>{health.total}</strong><span>Phiếu trong kỳ</span></article><article><strong>{health.unlinked.length}</strong><button className="btn btn-secondary btn-sm" onClick={()=>pick({name:'Phiếu cần đối chiếu thiết bị',tickets:health.unlinked})}>Cần đối chiếu</button></article><article><strong>{health.repeat30} / {health.repeat90}</strong><span>Tái lỗi · 30 / 90 ngày</span></article><article><strong>{percentage(health.currentFailureRate)}</strong><span>{health.faultyTotal} / {health.operatingTotal} thiết bị có lỗi</span></article></div>
   <section aria-label="Tỷ lệ lỗi thiết bị đang hoạt động"><h4>Tỷ lệ lỗi theo thiết bị</h4><details className="health-method"><summary>Cách tính</summary><p className="resource-muted">Số liệu theo hồ sơ. Tỷ lệ chỉ gồm phiếu đã định danh thiết bị. Mỗi thiết bị có lỗi trong kỳ chỉ tính một lần trong tỷ lệ %. Số phiếu thể hiện số lần xử lý, có thể nhiều lần trên cùng máy. Chỉ tính thiết bị có liên kết đúng, thuộc bộ máy Đã lắp đặt tại NPP; loại kho, thu hồi và bộ máy bảo trì khỏi mẫu số. Đây là đối chiếu với đội máy hiện tại, không phải tỷ lệ vận hành lịch sử.</p><p className="resource-muted">Tỷ trọng phiếu tính trên tổng số phiếu trong kỳ.</p></details><div className="health-rate-grid">{health.operatingStats.map(row=><button className="health-rate-card" key={row.id} onClick={()=>pick(row)}><span>{row.name}</span><strong>{percentage(row.rate)}</strong><span>{row.faulty} / {row.operating} thiết bị có lỗi</span><small>{row.incidents} phiếu lỗi · {row.incidentsPer100==null?'Chưa có mẫu số':row.incidentsPer100.toLocaleString('vi-VN',{maximumFractionDigits:1})+' phiếu / 100 thiết bị'}</small>{row.excluded>0&&<small className="repair-missing-fields">{row.excluded} liên kết cần kiểm tra</small>}</button>)}</div></section>
   <StableDevices rows={health.stableDevices} nppId={nppId} />
   {health.unknownDates>0&&<p className="resource-muted">Có {health.unknownDates} phiếu thiếu hoặc sai ngày, chưa đưa vào biểu đồ thời gian.</p>}
   <div className="health-chart-grid"><Chart title="Tình trạng bộ máy hiện tại" rows={health.states} stacked={false}/><Chart title="NPP hay sửa chữa / đổi trả" rows={health.distributors} onPick={pick}/><Chart title="Thiết bị có nhiều phiếu" rows={health.equipment} onPick={pick}/><Chart title="Sự cố theo model" rows={health.models} onPick={pick}/><Chart title="Xu hướng sự cố theo năm" rows={health.trend.slice(-10)} onPick={pick} limit={10}/><article className="health-chart"><h4>Tỷ trọng phiếu</h4>{health.categories.map(row=><button className="health-category-row" key={row.id} onClick={()=>pick(row)}><span>{row.name}</span><strong>{row.total} phiếu · {row.share.toFixed(1)}%</strong></button>)}</article></div>
  </>}
  {selection&&<SafePortal><div className="modal-overlay"><div className="modal-content" role="dialog" aria-modal="true" aria-label={selection.name}><div className="modal-header"><h3>{selection.name}</h3><button className="btn btn-secondary" onClick={()=>setSelection(null)}>Đóng</button></div><div className="modal-body">{selection.tickets.length?selection.tickets.slice((page-1)*25,page*25).map(ticket=><article className="health-ticket" key={ticket.id}><strong>{ticket.ticketCode} · {ticket.nppName||'Chưa rõ NPP'}</strong><p>{ticket.date} · {ticket.machineModel} · {ticket.serialNumber||'Chưa có seri'}</p><p>{ticket.errorDescription}</p><div className="repair-inline-photos">{(Array.isArray(ticket.photos)?ticket.photos:[]).slice(0,3).map((url,index)=><img loading="lazy" src={url} alt={`Ảnh lỗi ${index+1}`} key={index}/>)}</div><button className="btn btn-secondary" onClick={()=>onNavigate?.('repairs',ticket.ticketCode)}>Mở phiếu và ảnh lỗi</button></article>):<p>Không có phiếu.</p>}</div>{selectionPages>1&&<div className="modal-footer"><button className="btn btn-secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>Trước</button><span>Trang {page}/{selectionPages} · {selection.tickets.length} phiếu</span><button className="btn btn-secondary" disabled={page>=selectionPages} onClick={()=>setPage(page+1)}>Sau</button></div>}</div></div></SafePortal>}
 </section>;
}

const stableGroups = [
  ['computer', 'Máy tính'],
  ['dispenser', 'Máy chiết'],
  ['mixer', 'Máy lắc'],
  ['printer', 'Máy in'],
];

function StableDevices({ rows, nppId }) {
  const [kind, setKind] = useState('ALL');
  const [limit, setLimit] = useState(12);
  const filteredRows = useMemo(() => nppId === 'ALL' ? rows : rows.filter(row => row.nppId === nppId), [rows, nppId]);
  const groups = useMemo(() => stableGroups.map(([id, label]) => ({
    id, label, devices: filteredRows.filter(row => row.kind === id),
  })), [filteredRows]);
  const visible = kind === 'ALL' ? filteredRows : groups.find(group => group.id === kind)?.devices ?? [];
  const labels = Object.fromEntries(stableGroups);
  return (
    <section className="stable-devices" aria-label="Thiết bị hoạt động ổn định theo NPP">
      <h4>Thiết bị NPP đang hoạt động ổn định</h4>
      <p className="resource-muted">Số năm trọn vẹn gần nhất không ghi nhận phiếu sự cố. Thiết bị chưa có lịch sử phiếu chỉ được tính từ năm hiện tại.</p>
      <div className="stable-devices-filters" role="group" aria-label="Lọc theo loại thiết bị">
        {[{ id: 'ALL', label: 'Tất cả', devices: rows }, ...groups].map(group => (
          <button key={group.id} type="button" aria-pressed={kind === group.id}
            onClick={() => { setKind(group.id); setLimit(12); }}>
            <span>{group.label}</span><strong>{group.devices.length}</strong>
          </button>
        ))}
      </div>
      {visible.length ? (
        <ul className="stable-devices-grid">
          {visible.slice(0, limit).map(row => (
            <li key={row.id}>
              <div className="stable-device-meta"><span>{labels[row.kind]}</span><strong>{row.years} năm</strong></div>
              <strong>{row.name}</strong>
              <div className="stable-device-npp"><span>NPP</span><strong>{row.nppName}</strong>{row.nppId&&<small>Mã: {row.nppId}</small>}</div>
            </li>
          ))}
        </ul>
      ) : <p className="resource-muted">Không có thiết bị phù hợp trong nhóm này.</p>}
      {visible.length > limit && (
        <button type="button" className="btn btn-secondary" onClick={() => setLimit(value => value + 12)}>
          Xem thêm · {visible.length - limit} thiết bị
        </button>
      )}
    </section>
  );
}
