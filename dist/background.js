const y={global:!0,local:{},log:{}},C=({global:e,local:n,log:r}={})=>{if(typeof e=="boolean"&&(y.global=e),n&&typeof n=="object")for(const[t,o]of Object.entries(n))typeof o=="boolean"&&(y.local[t]=o);if(r&&typeof r=="object")for(const[t,o]of Object.entries(r))typeof o=="boolean"&&(y.log[t]=o)},$=(e,n)=>!(!y.global||e&&y.local[e]===!1||n&&y.log[n]===!1),I=e=>{const n=e?`[UBC Workday - Schedule Tool (file: ${e})]
`:`[UBC Workday - Schedule Tool]
`;return{log:(s,...d)=>{let c=null,u=null;s&&typeof s=="object"&&!Array.isArray(s)?(c=s,u=d):(c=null,u=[s,...d]);const m=c?.id,g=c?.on===!0;c?.on!==!1&&(!g&&!$(e,m)||console.log(n,...u))},warn:(s,...d)=>{let c=null,u=null;s&&typeof s=="object"&&!Array.isArray(s)?(c=s,u=d):u=[s,...d];const m=c?.id,g=c?.on===!0;c?.on!==!1&&(!g&&!$(e,m)||console.log("⚠️",n,...u))},error:(s,...d)=>{let c=null,u=null;s&&typeof s=="object"&&!Array.isArray(s)?(c=s,u=d):u=[s,...d];const m=c?.id,g=c?.on===!0;c?.on!==!1&&(!g&&!$(e,m)||console.log("🚩",n,...u))},on:()=>C({local:{[e]:!0}}),off:()=>C({local:{[e]:!1}})}},R=I("rmpApi");C({local:{rmpApi:!1}});const j="https://www.ratemyprofessors.com",M="https://www.ratemyprofessors.com/graphql",Y="dGVzdDp0ZXN0",H="FETCH_RMP_RATING",q="U2Nob29sLTE0MTM=",W="U2Nob29sLTU0MzY=",z=/^(dr|prof|professor|mr|mrs|ms)\.?\s+/i,Z=/\s(?:and|&)\s|\/|;|\|/i,N=new Map;function A(e){return String(e||"").replace(/\s+/g," ").trim()}function V(e){return A(e).replace(/\([^)]*\)/g," ").replace(z,"").replace(/,$/,"").trim()}function K(e){const n=V(e);if(!n)return null;const r=n.toUpperCase();if(r==="N/A"||r==="TBA"||r==="STAFF"||Z.test(n))return null;let t=n;if(n.includes(",")){const s=n.split(",").map(d=>A(d)).filter(Boolean);if(s.length!==2)return null;t=`${s[1]} ${s[0]}`}const o=t.split(" ").map(s=>s.trim()).filter(Boolean);if(o.length<2)return null;const i=o[0],a=o[o.length-1];return{fullName:o.join(" "),firstName:i,lastName:a}}function Q(e){return String(e).toUpperCase()==="UBCO"?W:q}function J(e,n){return{query:`query TeacherSearchResultsPageQuery(
  $query: TeacherSearchQuery!
  $schoolID: ID
  $includeSchoolFilter: Boolean!
) {
  search: newSearch {
    ...TeacherSearchPagination_search_1ZLmLD
  }
  school: node(id: $schoolID) @include(if: $includeSchoolFilter) {
    __typename
    ... on School {
      name
    }
    id
  }
}

fragment TeacherSearchPagination_search_1ZLmLD on newSearch {
  teachers(query: $query, first: 8, after: "") {
    didFallback
    edges {
      cursor
      node {
        ...TeacherCard_teacher
        id
        __typename
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    resultCount
    filters {
      field
      options {
        value
        id
      }
    }
  }
}

fragment TeacherCard_teacher on Teacher {
  id
  legacyId
  avgRating
  numRatings
  ...CardFeedback_teacher
  ...CardSchool_teacher
  ...CardName_teacher
  ...TeacherBookmark_teacher
}

fragment CardFeedback_teacher on Teacher {
  wouldTakeAgainPercent
  avgDifficulty
}

fragment CardSchool_teacher on Teacher {
  department
  school {
    name
    id
  }
}

fragment CardName_teacher on Teacher {
  firstName
  lastName
}

fragment TeacherBookmark_teacher on Teacher {
  id
  isSaved
}
`,variables:{query:{text:e,schoolID:n,fallback:!1,departmentID:null},schoolID:n,includeSchoolFilter:!0}}}function X(e,n){const r=e?.data?.search?.teachers?.edges;if(!Array.isArray(r)||!r.length)return null;const t=String(n?.firstName||"").toLowerCase(),o=String(n?.lastName||"").toLowerCase();for(const i of r){const a=i?.node;if(!a||a.avgRating===0)continue;const s=A(a.firstName).toLowerCase(),d=A(a.lastName).toLowerCase();if(s.startsWith(t)&&d.endsWith(o))return{rating:a.avgRating,link:`${j}/professor/${a.legacyId}`}}return null}async function ee({profName:e,campus:n}={}){const r=K(e);if(!r)return null;const t=String(n||"").toUpperCase()==="UBCO"?"UBCO":"UBCV",o=Q(t),i=`${t}|${r.fullName.toUpperCase()}`;if(N.has(i))return N.get(i);R.log({id:"queryProfRating.request"},"Fetching professor rating",{profName:r.fullName,campus:t});const a=await fetch(M,{method:"POST",headers:{Authorization:`Basic ${Y}`,"Content-Type":"application/json"},body:JSON.stringify(J(r.fullName,o))});if(!a.ok){const c=new Error(`RateMyProfessors request failed (${a.status})`);throw c.status=a.status,c}const s=await a.json(),d=X(s,r);return N.set(i,d),R.log({id:"queryProfRating.response"},"Resolved professor rating",{profName:r.fullName,campus:t,result:d}),d}const v=I("calendar-event-builder");C({local:{"calendar-event-builder":!1}});const F={Mon:"MO",Tue:"TU",Wed:"WE",Thu:"TH",Fri:"FR",Sat:"SA",Sun:"SU"},te=Object.values(F),ne={1:"11",2:"6",3:"3",4:"9",5:"5",6:"10",7:"7",8:"4"},re=e=>{const n=e?.colorIndex;return Number.isInteger(n)?ne[n]:void 0},oe=/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/,ae=/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*-\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i,se=/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,ie=/\b(?:room|rm)\b\s*[:\-]?\s*([A-Za-z0-9]+)/i,ce=/\bfloor\b\s*[:\-]?\s*(-?[A-Za-z0-9]+)/i,h=e=>String(e).padStart(2,"0"),L=(e,n,r)=>{let t=Number.parseInt(e,10);const o=Number.parseInt(n,10),i=r.toLowerCase();return i==="p"&&t!==12&&(t+=12),i==="a"&&t===12&&(t=0),{hours:t,minutes:o}},le=e=>{const n=String(e||""),r=n.match(oe),t=n.match(ae),o=n.match(se)||[];if(!r||!t||!o.length)return null;const i=[...new Set(o.map(a=>F[a]).filter(Boolean))];return i.length?{startDate:r[1],endDate:r[2],startTime:L(t[1],t[2],t[3]),endTime:L(t[4],t[5],t[6]),dayCodes:i}:null},de=e=>{const n=e.getDay();return te[n===0?6:n-1]},ue=(e,n)=>{const r=new Date(`${e}T00:00:00`);for(let t=0;t<7;t+=1){const o=new Date(r);if(o.setDate(r.getDate()+t),n.includes(de(o)))return o}return r},U=e=>{const n=e.getFullYear(),r=h(e.getMonth()+1),t=h(e.getDate()),o=h(e.getHours()),i=h(e.getMinutes());return`${n}-${r}-${t}T${o}:${i}:00`},fe=e=>{const n=e.getUTCFullYear(),r=h(e.getUTCMonth()+1),t=h(e.getUTCDate()),o=h(e.getUTCHours()),i=h(e.getUTCMinutes()),a=h(e.getUTCSeconds());return`${n}${r}${t}T${o}${i}${a}Z`},he=e=>{const n=String(e||""),r=n.split("|").map(a=>a.trim()).filter(Boolean),t=r.find(a=>/\([A-Z]{2,}\)/.test(a)),o=n.match(ce),i=n.match(ie);if(t){const a=[o?`Floor ${o[1]}`:null,i?`Room ${i[1]}`:null].filter(Boolean);return a.length?`${t} – ${a.join(", ")}`:t}return r.find(a=>/online/i.test(a))||""},me=e=>[e.section_number?`Section: ${e.section_number}`:null,e.instructor&&e.instructor!=="N/A"?`Instructor: ${e.instructor}`:null,e.instructionalFormat?`Format: ${e.instructionalFormat}`:null].filter(Boolean).join(`
`),ge=e=>{const n=[e.code,e.title].filter(Boolean).join(" - ")||"Course";return e.instructionalFormat&&e.instructionalFormat!=="Lecture"?`${n} (${e.instructionalFormat})`:n},pe=(e,n,r)=>{const t=le(n);if(!t)return v.warn({id:"buildEvent.skip"},"Could not parse meeting line:",n),null;const o=ue(t.startDate,t.dayCodes),i=new Date(o);i.setHours(t.startTime.hours,t.startTime.minutes,0,0);const a=new Date(o);a.setHours(t.endTime.hours,t.endTime.minutes,0,0);const s=new Date(`${t.endDate}T23:59:59`),d={summary:ge(e),description:me(e),location:he(n),start:{dateTime:U(i),timeZone:r},end:{dateTime:U(a),timeZone:r},recurrence:[`RRULE:FREQ=WEEKLY;BYDAY=${t.dayCodes.join(",")};UNTIL=${fe(s)}`]},c=re(e);return c&&(d.colorId=c),v.log({id:"buildEvent"},d),d};function ye(e,{timeZone:n}={}){return(Array.isArray(e?.meetingLines)?e.meetingLines:[]).map(t=>pe(e,t,n)).filter(Boolean)}const p=I("calendarIntegration");C({local:{calendarIntegration:!1}});const k="https://www.googleapis.com/calendar/v3",Ce="America/Vancouver",O="wstSource",B="workday-import",w={SYNC:"SYNC_GCAL",AUTH_STATE:"AUTH_STATE_GCAL",SIGN_IN:"SIGN_IN_GCAL",DISCONNECT:"DISCONNECT_GCAL"},b="wstGoogleCalendarSignedIn",_=({interactive:e=!0}={})=>new Promise((n,r)=>{if(!chrome?.identity?.getAuthToken){r(new Error("Chrome Identity API is unavailable. Reload the extension from chrome://extensions in Google Chrome and make sure the identity permission is enabled."));return}chrome.identity.getAuthToken({interactive:e},t=>{chrome.runtime.lastError?r(new Error(chrome.runtime.lastError.message||"Auth failed")):t?n(t):r(new Error("No auth token returned by Chrome Identity API"))})}),x=e=>new Promise(n=>{if(!e||!chrome?.identity?.removeCachedAuthToken)return n();chrome.identity.removeCachedAuthToken({token:e},()=>n())}),Te=()=>new Promise(e=>{if(!chrome?.storage?.local){e(!1);return}chrome.storage.local.get({[b]:!1},n=>{e(!!n?.[b])})}),G=e=>new Promise(n=>{if(!chrome?.storage?.local){n();return}chrome.storage.local.set({[b]:!!e},()=>n())}),Se=e=>({...e,extendedProperties:{...e.extendedProperties||{},private:{...e.extendedProperties?.private||{},[O]:B}}}),we=async(e,n,r)=>{const t=`${k}/calendars/${encodeURIComponent(n)}/events`,o=await fetch(t,{method:"POST",headers:{Authorization:`Bearer ${e}`,"Content-Type":"application/json"},body:JSON.stringify(r)});if(o.ok)return o.json();const i=await o.text().catch(()=>""),a=new Error(`Calendar API error ${o.status}: ${i||o.statusText}`);throw a.status=o.status,a},Ae=async(e,n)=>{const r=[];let t;do{const o=new URLSearchParams({privateExtendedProperty:`${O}=${B}`,maxResults:"2500",showDeleted:"false",fields:"items(id),nextPageToken"});t&&o.set("pageToken",t);const i=`${k}/calendars/${encodeURIComponent(n)}/events?${o.toString()}`,a=await fetch(i,{headers:{Authorization:`Bearer ${e}`}});if(!a.ok){const d=await a.text().catch(()=>""),c=new Error(`Calendar list error ${a.status}: ${d||a.statusText}`);throw c.status=a.status,c}const s=await a.json();Array.isArray(s.items)&&r.push(...s.items),t=s.nextPageToken}while(t);return r},_e=async(e,n,r)=>{const t=`${k}/calendars/${encodeURIComponent(n)}/events/${encodeURIComponent(r)}`,o=await fetch(t,{method:"DELETE",headers:{Authorization:`Bearer ${e}`}});if(o.ok||o.status===410)return;const i=await o.text().catch(()=>""),a=new Error(`Calendar delete error ${o.status}: ${i||o.statusText}`);throw a.status=o.status,a};async function Ie(e,n={}){const r=n.calendarId||"primary",t=n.timeZone||Ce;if(!Array.isArray(e)||!e.length)return p.warn("No courses provided"),{removed:0,deleteFailed:0,added:0,failed:0,skipped:0,errors:[]};const o=e.flatMap(l=>ye(l,{timeZone:t})).map(Se),i=e.reduce((l,f)=>l+(Array.isArray(f?.meetingLines)?f.meetingLines.length:0),0),a=Math.max(0,i-o.length);p.log({id:"syncCoursesToCalendar.events"},`Built ${o.length} event(s) from ${e.length} course(s); skipped ${a} unparseable line(s)`);let s=await _({interactive:!0});const d=async l=>{try{return await l(s)}catch(f){if(f.status!==401)throw f;return p.warn({id:"withRetry.refresh"},"Token rejected, refreshing once"),await x(s),s=await _({interactive:!0}),l(s)}},c=await d(l=>Ae(l,r));p.log({id:"syncCoursesToCalendar.existing"},`Found ${c.length} previously imported event(s)`);const u=c.length?await Promise.allSettled(c.map(l=>d(f=>_e(f,r,l.id)))):[],m=u.filter(l=>l.status==="fulfilled").length,g=u.filter(l=>l.status==="rejected").length,S=u.filter(l=>l.status==="rejected").map(l=>l.reason),E=o.length?await Promise.allSettled(o.map(l=>d(f=>we(f,r,l)))):[],D={removed:m,deleteFailed:g,added:E.filter(l=>l.status==="fulfilled").length,failed:E.filter(l=>l.status==="rejected").length,skipped:a,errors:[...S,...E.filter(l=>l.status==="rejected").map(l=>l.reason)]};return p.log({id:"syncCoursesToCalendar.summary"},D),D}async function P(){return{signedIn:await Te()}}async function Ee(){return await _({interactive:!0}),await G(!0),{signedIn:!0}}async function $e(){await G(!1);try{const e=await _({interactive:!1});return await x(e),p.log({id:"disconnectCalendar"},"Cached calendar auth token cleared"),{cleared:!0}}catch(e){return p.log({id:"disconnectCalendar.noop"},"No cached token to clear:",e.message),{cleared:!1}}}const T=I("background");C({local:{background:!1}});chrome.runtime.onMessage.addListener((e,n,r)=>{if(e?.type===H)return(async()=>{try{const t=await ee(e?.payload||{});r({ok:!0,data:t})}catch(t){T.error("Failed to fetch professor rating",{sender:n?.tab?.id||"unknown",error:String(t)}),r({ok:!1,error:t?.message||"Failed to fetch professor rating"})}})(),!0});chrome.runtime.onMessage.addListener((e,n,r)=>{if(e?.type===w.SYNC)return(async()=>{try{const{courses:t,options:o}=e.payload||{};if(!(await P()).signedIn){r({ok:!1,error:"Go to Settings and sign into Google first."});return}const a=await Ie(t,o);r({ok:!0,summary:{removed:a.removed,deleteFailed:a.deleteFailed,added:a.added,failed:a.failed,skipped:a.skipped,errors:a.errors.map(s=>s?.message||String(s))}})}catch(t){T.error("Calendar sync failed",{sender:n?.tab?.id||"unknown",error:String(t)}),r({ok:!1,error:t?.message||"Calendar sync failed"})}})(),!0;if(e?.type===w.AUTH_STATE)return(async()=>{try{const t=await P();r({ok:!0,signedIn:t.signedIn})}catch(t){T.error("Calendar auth state check failed",{error:String(t)}),r({ok:!1,error:t?.message||"Google auth state check failed"})}})(),!0;if(e?.type===w.SIGN_IN)return(async()=>{try{const t=await Ee();r({ok:!0,signedIn:t.signedIn})}catch(t){T.error("Calendar sign-in failed",{error:String(t)}),r({ok:!1,error:t?.message||"Google sign-in failed"})}})(),!0;if(e?.type===w.DISCONNECT)return(async()=>{try{const t=await $e();r({ok:!0,cleared:t.cleared})}catch(t){T.error("Calendar disconnect failed",{error:String(t)}),r({ok:!1,error:t?.message||"Disconnect failed"})}})(),!0});
//# sourceMappingURL=background.js.map
