import {useCallback,useEffect,useState,useRef} from 'react';
import {useAuth} from '../context/AuthContext.jsx';
import {isSupabaseConfigured,safeQuery} from '../lib/supabase.js';
import {readReplacementEvents} from '../lib/equipmentReplacement.js';
import {getCachedOfflineData,cacheOfflineData} from '../lib/offlineSync.js';
export function useReplacementEvents(){
 const {user}=useAuth();const owner=useRef(user?.id);owner.current=user?.id;const [events,setEvents]=useState([]);const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  if(!user?.id)return;const requestOwner=user.id;
  if(!isSupabaseConfigured||!navigator.onLine){const cached=await getCachedOfflineData('equipment_replacement_events',[]);if(owner.current===requestOwner)setEvents(cached);return;}
  try {const rows=await readReplacementEvents(safeQuery);if(owner.current!==requestOwner)return;setEvents(rows);cacheOfflineData('equipment_replacement_events',rows);setError('');}
  catch{if(owner.current===requestOwner)setError('Chưa tải được lịch sử thay thiết bị. Không thể coi dữ liệu trống là chưa từng thay máy.');}
 },[user?.id]);
 useEffect(()=>{setEvents([]);setError('');refresh();const timer=setInterval(refresh,60000);return()=>clearInterval(timer);},[refresh]);
 const addLocalEvent=event=>{if(isSupabaseConfigured)throw Error('DEMO_ONLY');setEvents(previous=>{const next=[event,...previous.filter(item=>item.operation_id!==event.operation_id)];cacheOfflineData('equipment_replacement_events',next);return next;});};
 return {events,error,refresh,addLocalEvent};
}
