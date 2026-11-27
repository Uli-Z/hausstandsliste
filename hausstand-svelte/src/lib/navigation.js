// One navigation model for the offline file, GitHub Pages and PHP.
// URL fragments are client-side only: no server rewrites or project names.
const sections = new Set(['overview','items','people','money','activity','save','settings']);
const detailSection = page => page==='item'?'items':page==='person'?'people':null;
export function routeSection(route) {
  return sections.has(route?.section) ? route.section : detailSection(route?.page) || 'overview';
}
export function normalizeRoute(route, previous) {
  const section = sections.has(route?.section) ? route.section
    : previous ? routeSection(previous) : routeSection(route);
  if (detailSection(route?.page) && typeof route.id==='string' && route.id.length)
    return {page:route.page,id:route.id,section};
  return {page:'dashboard',section};
}
export function routeHash(route) {
  const normalized=normalizeRoute(route);
  const detail=detailSection(normalized.page);
  return detail ? '#/'+detail+'/'+encodeURIComponent(normalized.id) : '#/'+normalized.section;
}
export function routeFromHash(hash, originSection) {
  if (!hash || hash==='#' || hash==='#/') return {page:'dashboard',section:'overview'};
  const parts=hash.startsWith('#/')?hash.slice(2).split('/'):[];
  if (parts.length===1 && sections.has(parts[0])) return {page:'dashboard',section:parts[0]};
  if (parts.length===2 && ['items','people'].includes(parts[0]) && parts[1]) {
    try {
      const id=decodeURIComponent(parts[1]);
      if (id) return {page:parts[0]==='items'?'item':'person',id,
        section:sections.has(originSection)?originSection:parts[0]};
    } catch { /* invalid escape: use directory */ }
    return {page:'dashboard',section:parts[0]};
  }
  return {page:'dashboard',section:'overview'};
}
export function availableRoute(route, project) {
  const target=normalizeRoute(route);
  const detail=detailSection(target.page);
  if (!detail) return target;
  if (!(project?.[detail]||[]).some(row=>row.id===target.id))
    return {page:'dashboard',section:detail};
  return target;
}
const sameRoute=(a,b)=>a.page===b.page && a.id===b.id && routeSection(a)===routeSection(b);

// Start only after the local copy is hydrated / server authentication succeeds.
// pushState doesn't trigger popstate/hashchange. Both external events can fire
// for one traversal; route equality prevents duplicate store writes.
export function connectRouteHistory(browser, store, onNavigate=()=>{}) {
  let current;
  let applying=false;
  const metadata=route=>({hausstandSection:routeSection(route)});
  const replaceLocation=route=>browser.history.replaceState(metadata(route),'',routeHash(route));
  function fromLocation() {
    const next=availableRoute(routeFromHash(browser.location.hash,browser.history.state?.hausstandSection),current.project);
    const changed=!sameRoute(current.route,next);
    applying=true;
    try { if(changed) store.setRoute(next); }
    finally { applying=false; }
    if(browser.location.hash!==routeHash(next) || browser.history.state?.hausstandSection!==routeSection(next))
      replaceLocation(next);
    if(changed) onNavigate();
  }
  // Read the current project synchronously without writing a browser entry.
  const stop=store.subscribe(state=>{
    const previous=current;
    current=state;
    if (!previous || applying || sameRoute(previous.route,state.route)) return;
    const route=normalizeRoute(state.route);
    if (browser.location.hash!==routeHash(route))
      browser.history.pushState(metadata(route),'',routeHash(route));
    else if(browser.history.state?.hausstandSection!==routeSection(route)) replaceLocation(route);
    onNavigate();
  });
  fromLocation();
  browser.addEventListener('popstate',fromLocation);
  browser.addEventListener('hashchange',fromLocation);
  return ()=>{
    stop();
    browser.removeEventListener('popstate',fromLocation);
    browser.removeEventListener('hashchange',fromLocation);
  };
}
