'use client';

import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

let locks=0;
let originalOverflow='';
export function SettingsIcon(){return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m9 3-.5 2-2 1.2-2-.6-2 3.5 1.5 1.4v3L2.5 15l2 3.5 2-.6 2 1.2.5 2h6l.5-2 2-1.2 2 .6 2-3.5-1.5-1.5v-3L21.5 9l-2-3.5-2 .6-2-1.2-.5-2Z"/><circle cx="12" cy="12" r="3"/></svg>;}

/** Shared shell for settings, editors and confirmations, outside the page header. */
export function Dialog({open,title,icon,onClose,children,wide=false,busy=false}: {
  open:boolean;title:string;icon:string;onClose:()=>void;children:ReactNode;wide?:boolean;busy?:boolean;
}){
  const panel=useRef<HTMLElement>(null),close=useRef(onClose),blocked=useRef(busy);
  useEffect(()=>{close.current=onClose;blocked.current=busy;},[onClose,busy]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    if(locks++===0){originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
    const frame=requestAnimationFrame(()=>{if(!panel.current?.contains(document.activeElement))panel.current?.focus();});
    const key=(event:KeyboardEvent)=>{
      const dialogs=document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if(dialogs[dialogs.length-1]!==panel.current)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!blocked.current)close.current();}
      if(event.key==='Tab'){
        const items=[...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[])].filter(e=>e.getClientRects().length>0);
        const first=items[0],last=items.at(-1);
        if(!first){event.preventDefault();panel.current?.focus();}
        else if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel.current)){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',key);if(--locks===0)document.body.style.overflow=originalOverflow;if(previous?.isConnected)previous.focus();};
  },[open]);
  if(!open||typeof document==='undefined')return null;
  return createPortal(<div className="modal-backdrop" role="presentation"><section ref={panel} tabIndex={-1} className={`modal-card ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-head"><span className="dialog-icon" aria-hidden="true">{icon==='settings'?<SettingsIcon/>:<span className="material-symbols-outlined">{icon}</span>}</span><h2>{title}</h2><button type="button" className="icon-only" disabled={busy} onClick={onClose} aria-label="关闭弹窗"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
    {children}
  </section></div>,document.body);
}
