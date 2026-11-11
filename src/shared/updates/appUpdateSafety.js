export async function flushBeforeAppUpdate(target=window){
 const pending=[];
 target.dispatchEvent(new CustomEvent('nasun-prepare-update',{detail:{waitUntil:promise=>pending.push(Promise.resolve(promise))}}));
 await Promise.all(pending);
 // The worker activates after its cache passes integrity checks; IndexedDB is preserved.
 return {draftsFlushed:pending.length,requiresAllTabsClosed:false};
}
