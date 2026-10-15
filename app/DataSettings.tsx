'use client';
import {Dialog,SettingsIcon} from './Dialog';
import {useState} from 'react';
import {createBrowserBackup,downloadJson,parseBackup,STATE_KEY,SEED_MARKER} from './data-backup';
export function DataSettings({state,onImport}:{state:Record<string,unknown>;onImport:(state:Record<string,unknown>)=>void}) {
  const [open,setOpen]=useState(false),[preview,setPreview]=useState<ReturnType<typeof parseBackup>|null>(null),[message,setMessage]=useState('');
  async function read(file?:File){if(!file)return;try{setPreview(parseBackup(await file.text()));setMessage('');}catch(error){setPreview(null);setMessage(error instanceof Error?error.message:'文件读取失败');}}
  function apply(){if(!preview)return;const keys=[STATE_KEY,SEED_MARKER,'trac-import-original-backup-v1'],before=keys.map(key=>localStorage.getItem(key));
    try{localStorage.setItem(STATE_KEY,JSON.stringify(preview.state));localStorage.setItem(SEED_MARKER,'1');localStorage.setItem(keys[2],JSON.stringify(preview.backup));onImport(preview.state);setPreview(null);setMessage('导入成功');}
    catch(error){keys.forEach(key=>{try{localStorage.removeItem(key);}catch{/* A denied store cannot have accepted writes. */}});keys.forEach((key,index)=>{try{const value=before[index];if(value!==null)localStorage.setItem(key,value);}catch{/* Retain the selected backup file and report failure. */}});setMessage(error instanceof Error?error.message:'保存失败');}}
  return <><button className="icon-only" aria-label="设置" onClick={()=>setOpen(true)}><SettingsIcon/></button>
    <Dialog open={open} title="数据设置" icon="settings" onClose={()=>setOpen(false)}>
      <div className="settings-content">
        <p className="dialog-copy">备份与恢复你的 Trac 数据。</p>
        <section className="settings-section"><h3>导出备份</h3><p>保存全部事件、历史、待办、习惯记录和设置。导出不会改变现有数据。</p>
          <div className="settings-actions"><button className="secondary-button" onClick={()=>{try{downloadJson(createBrowserBackup(localStorage,state),`trac-backup-${new Date().toISOString().slice(0,10)}.json`);setMessage('已生成备份，请保存文件');}catch(error){setMessage(error instanceof Error?error.message:'导出失败');}}}>导出所有数据</button></div>
        </section>
        <section className="settings-section"><h3>导入备份</h3><p>选择 Trac 导出的 JSON 文件，先预览，再确认恢复。</p><div className="settings-actions"><label className="secondary-button settings-file-button">选择备份文件<input className="visually-hidden" type="file" aria-label="导入备份" accept="application/json,.json" onChange={event=>{void read(event.target.files?.[0]);event.target.value='';}}/></label></div></section>
        {preview&&<section className="settings-section"><h3>导入预览</h3><div className="settings-preview"><div><strong>{(preview.state.events as unknown[]).length}</strong><span>事件模板</span></div><div><strong>{(preview.state.segments as unknown[]).length}</strong><span>历史时段</span></div><div><strong>{preview.state.activeEventId?1:0}</strong><span>当前事件</span></div></div><p className="settings-warning">确认后会替换此浏览器的现有数据。建议先导出一份备份。</p><div className="dialog-actions"><button className="secondary-button" onClick={()=>setPreview(null)}>取消</button><button className="primary-button inline" onClick={apply}>确认导入</button></div></section>}
        {message&&<p className="settings-status" role="status">{message}</p>}
      </div>
    </Dialog></>;
}
