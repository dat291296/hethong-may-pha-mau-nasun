export function normalizeDeviceType(category,value){
 if(category==='computer'||category==='computers')return value==='Case'?'Case':'AIO';
 return value;
}
