import React from 'react';
import {recordOperationalError} from '../lib/operationalDiagnostics.js';
export default class RepairWorkspaceBoundary extends React.Component {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error){recordOperationalError('runtime',error);console.warn('[Repairs] Workspace failed without record payload');}
  render(){
    if(this.state.failed)return <section className="glass-panel" role="alert" style={{padding:24}}><h2>Chưa mở được mục xử lý máy</h2><p>Không xóa dữ liệu hoặc bản nháp. Anh có thể chuyển sang mục khác, hoặc tải lại trang để lấy phiên bản ứng dụng hiện tại.</p><button className="btn btn-primary" onClick={()=>window.location.reload()}>Tải lại trang</button></section>;
    return this.props.children;
  }
}
