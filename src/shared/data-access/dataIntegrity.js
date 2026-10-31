function canonical(value,seen=new Set(),depth=0){
 if(depth>30)throw Error('DATA_DEPTH_LIMIT');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value!=='object'||seen.has(value))throw Error('INVALID_JSON_DATA');
 if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('INVALID_JSON_DATA');
 seen.add(value);let result;
 if(Array.isArray(value))result=value.map(item=>canonical(item,seen,depth+1));
 else {result={};for(const key of Object.keys(value).sort()){
  if(['__proto__','constructor','prototype'].includes(key))throw Error('INVALID_DATA_KEY');
  result[key]=canonical(value[key],seen,depth+1);
 }}
 seen.delete(value);return result;
}
export function canonicalData(value){return JSON.stringify(canonical(value));}
export async function dataChecksum(value){const bytes=new TextEncoder().encode(canonicalData(value));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');}
export function requireUniqueDataRows(rows,key){
 if(!Array.isArray(rows))throw Error('INVALID_DATA_ROWS');
 const identities=new Set();
 for(const row of rows){const id=row?.[key];if(typeof id!=='string'||!id.trim()||identities.has(id))throw Error('INVALID_OR_DUPLICATE_DATA_ID');identities.add(id);}
 return true;
}
export async function sealDataSnapshot(value){const payload=structuredClone(value);return {...payload,integrity:{algorithm:'SHA-256',digest:await dataChecksum(payload)}};}
export async function verifyDataSnapshot(value){
 if(!value||value.integrity?.algorithm!=='SHA-256'||!/^[a-f0-9]{64}$/.test(value.integrity?.digest||''))return false;
 const {integrity,...payload}=value;try{return await dataChecksum(payload)===integrity.digest;}catch{return false;}
}
