export async function flushBeforeAppUpdate(target=window){
 const pending=[];
 target.dispatchEvent(new CustomEvent('nasun-prepare-update',{detail:{waitUntil:promise=>pending.push(Promise.resolve(promise))}}));
 await Promise.all(pending);
 // The worker waits for every old tab to close; it never clears IndexedDB.
 return {draftsFlushed:pending.length,requiresAllTabsClosed:true};
}
