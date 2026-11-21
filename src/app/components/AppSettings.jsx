import { useEffect, useRef, useState } from 'react';
import { Settings, X } from 'lucide-react';
import { useAuth } from '../../shared/context/AuthContext.jsx';

const defaults = { theme: 'dark', fontSize: 16, showOperations: true, showCharts: true, showReport: true, company: 'NASUN PAINT', contact: '', logo: '' };
const eventName = 'nasun-app-settings-changed';
const keyFor = user => `nasun-app-settings-v1:${user?.id || 'local'}`;
function normalize(value = {}) {
  return { theme: value.theme === 'light' ? 'light' : 'dark', fontSize: [16,18,20].includes(value.fontSize) ? value.fontSize : 16,
    showOperations: value.showOperations !== false, showCharts: value.showCharts !== false, showReport: value.showReport !== false,
    company: typeof value.company === 'string' && value.company.trim() ? value.company.trim().slice(0,80) : defaults.company,
    contact: typeof value.contact === 'string' ? value.contact.trim().slice(0,160) : '',
    logo: typeof value.logo === 'string' && value.logo.length < 750000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value.logo) ? value.logo : '' };
}
function read(key) { try { return normalize(JSON.parse(localStorage.getItem(key)) || {}); } catch { return {...defaults}; } }
export function useAppSettings() {
  const { user } = useAuth();
  const key = keyFor(user);
  const [settings,setSettings] = useState(()=>read(key));
  useEffect(()=>{
    const update=()=>setSettings(read(key));
    update(); window.addEventListener(eventName,update); window.addEventListener('storage',update);
    return ()=>{window.removeEventListener(eventName,update);window.removeEventListener('storage',update);};
  },[key]);
  useEffect(()=>{
    document.documentElement.dataset.theme=settings.theme;
    document.documentElement.style.fontSize=`${settings.fontSize}px`;
  },[settings.theme,settings.fontSize]);
  return settings;
}
export default function AppSettings() {
  const { user,role } = useAuth();
  const settings = useAppSettings();
  const [draft,setDraft]=useState(settings);
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(false);
  const dialog=useRef(null);
  const canEditCompany=role==='admin';
  const update=(field,value)=>setDraft(previous=>({...previous,[field]:value}));
  const save=event=>{
    event.preventDefault();
    if(!draft.company.trim()){setMessage('Vui lòng nhập tên doanh nghiệp.');return;}
    const next=normalize(canEditCompany?draft:{...draft,company:settings.company,contact:settings.contact,logo:settings.logo});
    try { localStorage.setItem(keyFor(user),JSON.stringify(next));window.dispatchEvent(new Event(eventName));setMessage('Đã áp dụng và lưu trên trình duyệt này.'); }
    catch {setMessage('Không lưu được cài đặt. Bộ nhớ trình duyệt có thể đã đầy; hãy thử logo nhỏ hơn.');}
  };
  const upload=async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setLoading(true);setMessage('');
    try {
      if(file.size>512*1024)throw new Error('Logo tối đa 512 KB.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      const mime=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
      if(!mime)throw new Error('Chọn ảnh PNG, JPG hoặc WebP hợp lệ.');
      const blob=new Blob([bytes],{type:mime});const bitmap=await createImageBitmap(blob);const valid=bitmap.width<=4096&&bitmap.height<=4096;bitmap.close();if(!valid)throw new Error('Kích thước logo tối đa 4096 × 4096 px.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Không đọc được ảnh.'));reader.readAsDataURL(blob);});
      update('logo',data);
    } catch(error){setMessage(error.message||'Không tải được logo.');} finally {setLoading(false);}
  };
  return <><button type="button" className="btn btn-secondary" onClick={()=>{setDraft(settings);setMessage('');dialog.current.showModal();}}><Settings size={17}/> Cài đặt app</button>
  <dialog ref={dialog} className="app-settings-dialog" aria-labelledby="app-settings-title"><form onSubmit={save}>
    <header><h2 id="app-settings-title">Cài đặt app</h2><button type="button" className="btn btn-secondary" aria-label="Đóng cài đặt" onClick={()=>dialog.current.close()}><X size={18}/></button></header>
    <p className="settings-hint">Áp dụng ngay khi lưu. Cài đặt dành cho tài khoản trên trình duyệt này, chưa đồng bộ sang thiết bị khác.</p>
    <fieldset><legend>Giao diện</legend>
      <label>Chế độ màu<select value={draft.theme} onChange={e=>update('theme',e.target.value)}><option value="dark">Tối — mặc định</option><option value="light">Sáng</option></select></label>
      <label>Cỡ chữ<select value={draft.fontSize} onChange={e=>update('fontSize',Number(e.target.value))}><option value={16}>Tiêu chuẩn</option><option value={18}>Lớn</option><option value={20}>Rất lớn</option></select></label>
      <p>Hiển thị trên Tổng quan</p>{[['showOperations','Cần xử lý & phân bổ theo miền'],['showCharts','Biểu đồ tổng quan'],['showReport','Báo cáo & xuất dữ liệu']].map(([key,label])=><label className="settings-check" key={key}><input type="checkbox" checked={draft[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}
    </fieldset>
    <fieldset disabled={!canEditCompany||loading}><legend>Thông tin doanh nghiệp</legend>
      {!canEditCompany&&<p>Chỉ admin được chỉnh thông tin doanh nghiệp.</p>}
      <label>Tên doanh nghiệp<input value={draft.company} maxLength={80} onChange={e=>update('company',e.target.value)} required/></label>
      <label>Thông tin liên hệ<input value={draft.contact} maxLength={160} placeholder="Điện thoại hoặc email liên hệ" onChange={e=>update('contact',e.target.value)}/></label>
      <label>Logo (PNG, JPG, WebP · tối đa 512 KB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label>
      <div className="settings-logo"><img src={draft.logo||'/nasun_logo.png?v=3'} alt="Logo doanh nghiệp"/><button type="button" className="btn btn-secondary" onClick={()=>update('logo','')}>Dùng logo gốc</button></div>
    </fieldset>
    <p role="status">{loading?'Đang kiểm tra ảnh…':message}</p>
    <footer><button type="button" className="btn btn-secondary" onClick={()=>setDraft(canEditCompany?{...defaults}:{...defaults,company:settings.company,contact:settings.contact,logo:settings.logo})}>Khôi phục mặc định</button><button type="submit" className="btn btn-primary" disabled={loading}>Lưu & áp dụng</button></footer>
  </form></dialog></>;
}
