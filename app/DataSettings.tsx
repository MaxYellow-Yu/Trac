'use client';
import {useState} from 'react';
import {createBrowserBackup,downloadJson,parseBackup,STATE_KEY,SEED_MARKER} from './data-backup';
export function DataSettings({state,onImport}:{state:Record<string,unknown>;onImport:(state:Record<string,unknown>)=>void}) {
  const [open,setOpen]=useState(false),[preview,setPreview]=useState<ReturnType<typeof parseBackup>|null>(null),[message,setMessage]=useState('');
  async function read(file?:File){if(!file)return;try{setPreview(parseBackup(await file.text()));setMessage('');}catch(error){setPreview(null);setMessage(error instanceof Error?error.message:'文件读取失败');}}
  function apply(){if(!preview)return;const keys=[STATE_KEY,SEED_MARKER,'trac-import-original-backup-v1'],before=keys.map(key=>localStorage.getItem(key));
    try{localStorage.setItem(STATE_KEY,JSON.stringify(preview.state));localStorage.setItem(SEED_MARKER,'1');localStorage.setItem(keys[2],JSON.stringify(preview.backup));onImport(preview.state);setPreview(null);setMessage('导入成功');}
    catch(error){keys.forEach(key=>{try{localStorage.removeItem(key);}catch{/* A denied store cannot have accepted writes. */}});keys.forEach((key,index)=>{try{const value=before[index];if(value!==null)localStorage.setItem(key,value);}catch{/* Retain the selected backup file and report failure. */}});setMessage(error instanceof Error?error.message:'保存失败');}}
  return <><button className="icon-only" aria-label="设置" onClick={()=>setOpen(true)}><span className="material-symbols-outlined" aria-hidden="true">settings</span></button>
    {open&&<div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-label="数据设置"><div className="modal-head"><h2>数据设置</h2><button className="icon-only" aria-label="关闭设置" onClick={()=>setOpen(false)}>×</button></div>
      <p>备份包含全部模板、历史、当前事件、待办、习惯记录和设置。导出不会改变原数据。</p>
      <button className="primary-button inline" onClick={()=>{try{downloadJson(createBrowserBackup(localStorage,state),`trac-backup-${new Date().toISOString().slice(0,10)}.json`);setMessage('已生成备份，请保存文件');}catch(error){setMessage(error instanceof Error?error.message:'导出失败');}}}>导出所有数据</button>
      <label className="event-form">导入备份<input type="file" accept="application/json,.json" onChange={event=>{void read(event.target.files?.[0]);event.target.value='';}}/></label>
      {preview&&<><p>预览：模板 {(preview.state.events as unknown[]).length} 个，历史 {(preview.state.segments as unknown[]).length} 段，当前事件 {preview.state.activeEventId?'1':'0'} 个。</p><p>确认后替换此浏览器的现有数据；Android 导入采用冲突检查。</p><div className="dialog-actions"><button className="secondary-button" onClick={()=>setPreview(null)}>取消导入</button><button className="primary-button inline" onClick={apply}>确认导入</button></div></>}
      {message&&<p role="status">{message}</p>}
    </section></div>}</>;
}
